package data

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
)

var (
	ErrIdeaNotFound = errors.New("idea not found")
	ErrIdeaNotPublic = errors.New("idea is not public")
)

type IdeaRepo struct {
	d *Data
}

func NewIdeaRepo(d *Data) *IdeaRepo { return &IdeaRepo{d: d} }

func (r *IdeaRepo) Create(ctx context.Context, in *Idea) error {
	in.CreatedAt = time.Now()
	if in.Status == "" {
		in.Status = "pending"
	}
	return r.d.DB.WithContext(ctx).Create(in).Error
}

// PublicIdea is the API-shaped projection of Idea + its comment count. We
// avoid loading the full Idea here because the API never returns Contact /
// IPHash — leaking them through a struct's json tag-only mask is too brittle.
type PublicIdea struct {
	ID           uint      `json:"id"`
	CreatedAt    time.Time `json:"createdAt"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	Background   string    `json:"background,omitempty"`
	Lang         string    `json:"lang"`
	CommentCount int64     `json:"commentCount"`
}

func (r *IdeaRepo) ListPublic(ctx context.Context, page, size int) (items []PublicIdea, total int64, err error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}

	db := r.d.DB.WithContext(ctx).Model(&Idea{}).Where("status = ?", "public")
	if err = db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []PublicIdea{}, 0, nil
	}

	rows := []Idea{}
	if err = db.Order("created_at DESC").
		Offset((page - 1) * size).Limit(size).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	// Bulk-count comments per idea in one round-trip.
	ids := make([]uint, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	type countRow struct {
		IdeaID uint
		N      int64
	}
	var counts []countRow
	if err = r.d.DB.WithContext(ctx).
		Model(&Comment{}).
		Select("idea_id, COUNT(*) AS n").
		Where("status = ? AND idea_id IN ?", "public", ids).
		Group("idea_id").
		Scan(&counts).Error; err != nil {
		return nil, 0, err
	}
	cm := make(map[uint]int64, len(counts))
	for _, c := range counts {
		cm[c.IdeaID] = c.N
	}

	items = make([]PublicIdea, len(rows))
	for i, r := range rows {
		items[i] = PublicIdea{
			ID:           r.ID,
			CreatedAt:    r.CreatedAt,
			Title:        r.Title,
			Body:         r.Body,
			Background:   r.Background,
			Lang:         r.Lang,
			CommentCount: cm[r.ID],
		}
	}
	return items, total, nil
}

// GetPublic returns a single public idea by id (with its comment count) or
// ErrIdeaNotFound / ErrIdeaNotPublic. Used by the detail page endpoint.
func (r *IdeaRepo) GetPublic(ctx context.Context, id uint) (*PublicIdea, error) {
	var row Idea
	err := r.d.DB.WithContext(ctx).
		Where("id = ?", id).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrIdeaNotFound
		}
		return nil, err
	}
	if row.Status != "public" {
		return nil, ErrIdeaNotPublic
	}

	var count int64
	if err := r.d.DB.WithContext(ctx).
		Model(&Comment{}).
		Where("idea_id = ? AND status = ?", id, "public").
		Count(&count).Error; err != nil {
		return nil, err
	}

	return &PublicIdea{
		ID:           row.ID,
		CreatedAt:    row.CreatedAt,
		Title:        row.Title,
		Body:         row.Body,
		Background:   row.Background,
		Lang:         row.Lang,
		CommentCount: count,
	}, nil
}

// IsPublic returns nil if the idea exists and is publicly visible. Used by
// CommentRepo.Create as a precondition.
func (r *IdeaRepo) IsPublic(ctx context.Context, id uint) error {
	var status string
	err := r.d.DB.WithContext(ctx).
		Model(&Idea{}).
		Select("status").
		Where("id = ?", id).
		Scan(&status).Error
	if err != nil {
		return err
	}
	if status == "" {
		return ErrIdeaNotFound
	}
	if status != "public" {
		return ErrIdeaNotPublic
	}
	return nil
}

// CountSubmissionsSince counts ideas submitted by a given IP within a window.
// Used by the daily rate-limit guard. Per-minute throttling is handled by the
// in-memory token bucket — DB is only consulted for the longer window.
func (r *IdeaRepo) CountSubmissionsSince(ctx context.Context, ipHash string, since time.Time) (int64, error) {
	var n int64
	err := r.d.DB.WithContext(ctx).
		Model(&Idea{}).
		Where("ip_hash = ? AND created_at >= ?", ipHash, since).
		Count(&n).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	return n, nil
}
