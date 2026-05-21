package data

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
)

type CommentRepo struct {
	d *Data
}

func NewCommentRepo(d *Data) *CommentRepo { return &CommentRepo{d: d} }

func (r *CommentRepo) Create(ctx context.Context, in *Comment) error {
	in.CreatedAt = time.Now()
	if in.Status == "" {
		in.Status = "public"
	}
	return r.d.DB.WithContext(ctx).Create(in).Error
}

type PublicComment struct {
	ID        uint      `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Body      string    `json:"body"`
	// Mine is set to true when the row's client_id matches the requesting
	// browser. Lets the frontend mark "your comment" without exposing other
	// users' client IDs.
	Mine bool `json:"mine,omitempty"`
}

// ListByIdea returns the public comments on an idea, oldest first. When
// requesterClientID is non-empty, rows authored by that client are flagged
// with `Mine=true` so the UI can highlight them.
func (r *CommentRepo) ListByIdea(ctx context.Context, ideaID uint, page, size int, requesterClientID string) (items []PublicComment, total int64, err error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}

	db := r.d.DB.WithContext(ctx).Model(&Comment{}).
		Where("idea_id = ? AND status = ?", ideaID, "public")

	if err = db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []PublicComment{}, 0, nil
	}

	rows := []Comment{}
	if err = db.Order("created_at ASC").
		Offset((page - 1) * size).Limit(size).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	items = make([]PublicComment, len(rows))
	for i, c := range rows {
		items[i] = PublicComment{
			ID:        c.ID,
			CreatedAt: c.CreatedAt,
			Body:      c.Body,
			Mine:      requesterClientID != "" && c.ClientID == requesterClientID,
		}
	}
	return items, total, nil
}

func (r *CommentRepo) CountByIPSince(ctx context.Context, ipHash string, since time.Time) (int64, error) {
	var n int64
	err := r.d.DB.WithContext(ctx).
		Model(&Comment{}).
		Where("ip_hash = ? AND created_at >= ?", ipHash, since).
		Count(&n).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	return n, nil
}
