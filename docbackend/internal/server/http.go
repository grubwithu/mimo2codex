package server

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	khttp "github.com/go-kratos/kratos/v2/transport/http"

	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
	"github.com/7as0nch/mimo2codex/docbackend/internal/data"
	"github.com/7as0nch/mimo2codex/docbackend/internal/service"
)

// Build assembles the HTTP server with all routes mounted on /api/*. The
// stdlib mux + a single regex for /api/ideas/{id}/comments is enough for our
// surface — gorilla/chi would be overkill for five endpoints.
func Build(
	cfg *conf.HTTPServer,
	cors *conf.CORS,
	docs *data.DocsBundle,
	idea *service.IdeaService,
	comment *service.CommentService,
	ask *service.AskService,
	lg log.Logger,
) *khttp.Server {

	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","docCount":` + strconv.Itoa(docs.Count()) + `}`))
	})

	mux.HandleFunc("/api/ideas", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			idea.HandleSubmit(w, r)
		case http.MethodGet:
			idea.HandleList(w, r)
		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// /api/ideas/{id}            → single idea (detail page)
	// /api/ideas/{id}/comments   → comments under that idea
	// Two small regexes keep us out of a router library while still handling
	// both routes; the stdlib mux can't do path params on its own.
	ideaDetailRe := regexp.MustCompile(`^/api/ideas/(\d+)$`)
	commentsRe := regexp.MustCompile(`^/api/ideas/(\d+)/comments$`)
	mux.HandleFunc("/api/ideas/", func(w http.ResponseWriter, r *http.Request) {
		if m := ideaDetailRe.FindStringSubmatch(r.URL.Path); m != nil {
			id, err := strconv.ParseUint(m[1], 10, 64)
			if err != nil || id == 0 {
				http.NotFound(w, r)
				return
			}
			idea.HandleGet(w, r, uint(id))
			return
		}
		if m := commentsRe.FindStringSubmatch(r.URL.Path); m != nil {
			id, err := strconv.ParseUint(m[1], 10, 64)
			if err != nil || id == 0 {
				http.NotFound(w, r)
				return
			}
			comment.HandleByIdea(w, r, uint(id))
			return
		}
		http.NotFound(w, r)
	})

	mux.HandleFunc("/api/ask", ask.HandleAsk)

	handler := withCORS(cors, mux)
	handler = withAccessLog(handler, log.NewHelper(lg))

	addr := cfg.Addr
	if addr == "" {
		addr = "0.0.0.0:8080"
	}
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}

	srv := khttp.NewServer(
		khttp.Address(addr),
		khttp.Timeout(timeout),
	)
	srv.HandlePrefix("/", handler)
	return srv
}

func withCORS(cfg *conf.CORS, next http.Handler) http.Handler {
	allow := make(map[string]bool, len(cfg.AllowOrigins))
	for _, o := range cfg.AllowOrigins {
		allow[strings.TrimSpace(o)] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allow[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			// X-Client-Id is the browser-stamped UUID from localStorage. Adding
			// it here is what unblocks the preflight when the frontend tags
			// every request with the client identity.
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, X-Client-Id")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(s int) {
	r.status = s
	r.ResponseWriter.WriteHeader(s)
}

// Flush forwards to the wrapped ResponseWriter so SSE streaming through the
// access-log middleware keeps working. Without this the type assertion in
// AskService.HandleAsk would fail.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func withAccessLog(next http.Handler, lg *log.Helper) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		start := time.Now()
		next.ServeHTTP(rec, r)
		lg.Infof("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}
