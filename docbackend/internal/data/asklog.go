package data

import (
	"context"
	"time"
)

type AskLogRepo struct {
	d *Data
}

func NewAskLogRepo(d *Data) *AskLogRepo { return &AskLogRepo{d: d} }

func (r *AskLogRepo) Save(ctx context.Context, row *AskLog) error {
	if row.CreatedAt.IsZero() {
		row.CreatedAt = time.Now()
	}
	return r.d.DB.WithContext(ctx).Create(row).Error
}
