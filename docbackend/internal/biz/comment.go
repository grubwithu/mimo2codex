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

type SubmitCommentInput struct {
	IdeaID   uint
	Body     string
	IPHash   string
	ClientID string
}

type CommentUsecase struct {
	repo      *data.CommentRepo
	ideaRepo  *data.IdeaRepo
	cfg       *conf.RateLimit
	sanitizer *bluemonday.Policy
	limiter   *IPLimiter
}

func NewCommentUsecase(repo *data.CommentRepo, ideaRepo *data.IdeaRepo, cfg *conf.RateLimit) *CommentUsecase {
	return &CommentUsecase{
		repo:      repo,
		ideaRepo:  ideaRepo,
		cfg:       cfg,
		sanitizer: bluemonday.StrictPolicy(),
		limiter:   NewIPLimiter(cfg.CommentsPerMinute),
	}
}

func (u *CommentUsecase) Submit(ctx context.Context, in SubmitCommentInput) (uint, error) {
	if in.IdeaID == 0 {
		return 0, fmt.Errorf("%w: idea id is required", ErrValidation)
	}

	// Reject before any rate-limit accounting so brute-force probing of
	// nonexistent ideas can't burn a user's per-minute budget.
	if err := u.ideaRepo.IsPublic(ctx, in.IdeaID); err != nil {
		if errors.Is(err, data.ErrIdeaNotFound) {
			return 0, fmt.Errorf("%w: %v", ErrNotFound, err)
		}
		return 0, fmt.Errorf("%w: %v", ErrForbidden, err)
	}

	if !u.limiter.Allow(in.IPHash) {
		return 0, fmt.Errorf("%w: too many comments per minute", ErrRateLimit)
	}

	since := time.Now().Add(-24 * time.Hour)
	if n, err := u.repo.CountByIPSince(ctx, in.IPHash, since); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInternal, err)
	} else if int(n) >= u.cfg.CommentsPerDay {
		return 0, fmt.Errorf("%w: daily comment quota reached", ErrRateLimit)
	}

	body := u.clean(in.Body, 1000)
	if body == "" {
		return 0, fmt.Errorf("%w: comment body is required", ErrValidation)
	}

	row := &data.Comment{
		IdeaID:   in.IdeaID,
		Author:   "", // nickname dropped in v2 — see PublicComment.Mine for "your" tagging
		Body:     body,
		IPHash:   in.IPHash,
		ClientID: strings.TrimSpace(in.ClientID),
		Status:   "public",
	}
	if err := u.repo.Create(ctx, row); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInternal, err)
	}
	return row.ID, nil
}

func (u *CommentUsecase) List(ctx context.Context, ideaID uint, page, size int, requesterClientID string) ([]data.PublicComment, int64, error) {
	items, total, err := u.repo.ListByIdea(ctx, ideaID, page, size, requesterClientID)
	if err != nil {
		return nil, 0, fmt.Errorf("%w: %v", ErrInternal, err)
	}
	return items, total, nil
}

func (u *CommentUsecase) clean(s string, max int) string {
	s = u.sanitizer.Sanitize(s)
	s = strings.TrimSpace(s)
	if max > 0 && len(s) > max {
		s = s[:max]
	}
	return s
}
