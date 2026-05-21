package data

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// DocsBundle is the in-memory cache of doc/*.md content, split by language.
// We load the whole file set at startup and feed it verbatim into the LLM
// system prompt — the corpus is <200 KB, comfortably under any modern
// model's context window, so retrieval / chunking isn't worth the complexity
// at v1. See plan §"/api/ask 的策略".
type DocsBundle struct {
	EN map[string]string // slug -> markdown body
	ZH map[string]string
}

func (b *DocsBundle) Count() int { return len(b.EN) + len(b.ZH) }

// pickSrc returns the language-specific slug→body map, falling back to the
// other language when the requested side is empty (e.g. translations missing).
func (b *DocsBundle) pickSrc(lang string) map[string]string {
	src := b.EN
	if lang == "zh" {
		src = b.ZH
	}
	if len(src) == 0 {
		if lang == "zh" {
			src = b.EN
		} else {
			src = b.ZH
		}
	}
	return src
}

// ConcatBySlugs joins exactly the named docs (skipping unknown slugs) with
// per-file headers. The header format is what the model is told to cite from,
// so the frontend can show the same slug list to the user as "retrieved docs".
func (b *DocsBundle) ConcatBySlugs(lang string, slugs []string) string {
	src := b.pickSrc(lang)
	var sb strings.Builder
	for _, slug := range slugs {
		body, ok := src[slug]
		if !ok || body == "" {
			continue
		}
		sb.WriteString("\n\n===== doc: ")
		sb.WriteString(slug)
		sb.WriteString(" =====\n")
		sb.WriteString(body)
	}
	return sb.String()
}

var asciiTokenRe = regexp.MustCompile(`[a-z0-9]{2,}`)

// tokenize extracts retrieval keywords from a question: lowercase ASCII words
// of length ≥2, plus CJK bigrams (every consecutive pair of Han characters).
// Bigrams are a cheap proxy for "Chinese tokenization" that works well at this
// corpus size — for ~11 docs the false-positive rate from overlapping bigrams
// is dwarfed by the win of not needing jieba/gse as a dependency.
func tokenize(s string) []string {
	s = strings.ToLower(s)
	seen := map[string]bool{}
	var out []string
	add := func(tok string) {
		if tok == "" || seen[tok] {
			return
		}
		seen[tok] = true
		out = append(out, tok)
	}

	for _, m := range asciiTokenRe.FindAllString(s, -1) {
		add(m)
	}

	runes := []rune(s)
	cjkStart := -1
	flush := func(end int) {
		if cjkStart < 0 {
			return
		}
		seg := runes[cjkStart:end]
		if len(seg) == 1 {
			add(string(seg))
		} else {
			for j := 0; j <= len(seg)-2; j++ {
				add(string(seg[j : j+2]))
			}
		}
		cjkStart = -1
	}
	for i, r := range runes {
		if unicode.Is(unicode.Han, r) {
			if cjkStart < 0 {
				cjkStart = i
			}
		} else {
			flush(i)
		}
	}
	flush(len(runes))

	return out
}

// Search scores each doc in the requested language by how many of the
// question's keywords appear in it, and returns the top-K slugs in descending
// score order. If the question has no extractable keywords, we return the
// first K slugs alphabetically — better to give the LLM something than to
// blank out the prompt.
func (b *DocsBundle) Search(question, lang string, topK int) []string {
	if topK <= 0 {
		topK = 5
	}
	src := b.pickSrc(lang)
	if len(src) == 0 {
		return nil
	}

	keywords := tokenize(question)

	// No keywords (e.g. punctuation-only question): hand back N alphabetical slugs
	// so the model still has *some* context to work with.
	if len(keywords) == 0 {
		slugs := make([]string, 0, len(src))
		for s := range src {
			slugs = append(slugs, s)
		}
		sort.Strings(slugs)
		if len(slugs) > topK {
			slugs = slugs[:topK]
		}
		return slugs
	}

	type scored struct {
		slug  string
		score int
	}
	rows := make([]scored, 0, len(src))
	for slug, body := range src {
		lower := strings.ToLower(body)
		score := 0
		for _, kw := range keywords {
			score += strings.Count(lower, kw)
		}
		if score > 0 {
			rows = append(rows, scored{slug, score})
		}
	}

	if len(rows) == 0 {
		// No doc matched any keyword. Surface the alphabetical fallback so the
		// frontend still has something to display as "checked docs".
		slugs := make([]string, 0, len(src))
		for s := range src {
			slugs = append(slugs, s)
		}
		sort.Strings(slugs)
		if len(slugs) > topK {
			slugs = slugs[:topK]
		}
		return slugs
	}

	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].score != rows[j].score {
			return rows[i].score > rows[j].score
		}
		return rows[i].slug < rows[j].slug
	})
	if len(rows) > topK {
		rows = rows[:topK]
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.slug
	}
	return out
}

func LoadDocs(dir string) (*DocsBundle, error) {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("resolve docs dir: %w", err)
	}
	entries, err := os.ReadDir(absDir)
	if err != nil {
		return nil, fmt.Errorf("read docs dir %s: %w", absDir, err)
	}

	bundle := &DocsBundle{
		EN: make(map[string]string),
		ZH: make(map[string]string),
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		path := filepath.Join(absDir, e.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}

		name := strings.TrimSuffix(e.Name(), ".md")
		if strings.HasSuffix(name, ".zh") {
			slug := strings.TrimSuffix(name, ".zh")
			bundle.ZH[slug] = string(raw)
		} else {
			bundle.EN[name] = string(raw)
		}
	}
	return bundle, nil
}
