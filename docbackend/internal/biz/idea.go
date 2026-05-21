package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"

	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
	"github.com/7as0nch/mimo2codex/docbackend/internal/data"
)

type SubmitIdeaInput struct {
	Title      string
	Body       string
	Background string
	Contact    string
	Lang       string
	IPHash     string
	ClientID   string
}

type IdeaUsecase struct {
	repo      *data.IdeaRepo
	cfg       *conf.RateLimit
	sanitizer *bluemonday.Policy
	limiter   *IPLimiter
}

func NewIdeaUsecase(repo *data.IdeaRepo, cfg *conf.RateLimit) *IdeaUsecase {
	return &IdeaUsecase{
		repo:      repo,
		cfg:       cfg,
		sanitizer: bluemonday.StrictPolicy(),
		limiter:   NewIPLimiter(cfg.IdeasPerMinute),
	}
}

func (u *IdeaUsecase) Submit(ctx context.Context, in SubmitIdeaInput) (uint, error) {
	if !u.limiter.Allow(in.IPHash) {
		return 0, fmt.Errorf("%w: too many submissions per minute", ErrRateLimit)
	}

	since := time.Now().Add(-24 * time.Hour)
	if n, err := u.repo.CountSubmissionsSince(ctx, in.IPHash, since); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInternal, err)
	} else if int(n) >= u.cfg.IdeasPerDay {
		return 0, fmt.Errorf("%w: daily idea quota reached", ErrRateLimit)
	}

	title := u.clean(in.Title, 200)
	body := u.clean(in.Body, 4000)
	background := u.clean(in.Background, 500)
	contact := u.clean(in.Contact, 200)
	lang := strings.ToLower(strings.TrimSpace(in.Lang))
	if lang != "en" && lang != "zh" {
		lang = "en"
	}

	if title == "" {
		return 0, fmt.Errorf("%w: title is required", ErrValidation)
	}
	if body == "" {
		return 0, fmt.Errorf("%w: body is required", ErrValidation)
	}

	row := &data.Idea{
		Title:      title,
		Body:       body,
		Background: background,
		Contact:    contact,
		Lang:       lang,
		IPHash:     in.IPHash,
		ClientID:   strings.TrimSpace(in.ClientID),
		Status:     "pending",
	}
	if err := u.repo.Create(ctx, row); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInternal, err)
	}
	return row.ID, nil
}

func (u *IdeaUsecase) ListPublic(ctx context.Context, page, size int) (items []data.PublicIdea, total int64, err error) {
	items, total, err = u.repo.ListPublic(ctx, page, size)
	if err != nil {
		return nil, 0, fmt.Errorf("%w: %v", ErrInternal, err)
	}
	return items, total, nil
}

func (u *IdeaUsecase) GetPublic(ctx context.Context, id uint) (*data.PublicIdea, error) {
	if id == 0 {
		return nil, fmt.Errorf("%w: id is required", ErrValidation)
	}
	row, err := u.repo.GetPublic(ctx, id)
	if err != nil {
		if errors.Is(err, data.ErrIdeaNotFound) || errors.Is(err, data.ErrIdeaNotPublic) {
			return nil, fmt.Errorf("%w: %v", ErrNotFound, err)
		}
		return nil, fmt.Errorf("%w: %v", ErrInternal, err)
	}
	return row, nil
}

func (u *IdeaUsecase) clean(s string, max int) string {
	s = u.sanitizer.Sanitize(s)
	s = strings.TrimSpace(s)
	if max > 0 && len(s) > max {
		s = s[:max]
	}
	return s
}
