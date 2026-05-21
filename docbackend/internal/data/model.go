package data

import "time"

// Idea is a pain-point submission from the public ideas page. Newly submitted
// rows land as status='pending' and are hidden until manually flipped to
// 'public' via psql — see plan §"Idea status 流转".
type Idea struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time `gorm:"index:idx_status_created,priority:2,sort:desc" json:"createdAt"`
	Title      string    `gorm:"type:varchar(200);not null" json:"title"`
	Body       string    `gorm:"type:text;not null"         json:"body"`
	Background string    `gorm:"type:varchar(500)"          json:"background,omitempty"`
	Contact    string    `gorm:"type:varchar(200)"          json:"-"` // never leaves the server
	Lang       string    `gorm:"type:varchar(8);not null"   json:"lang"`
	IPHash     string    `gorm:"type:varchar(64);not null;index" json:"-"`
	// ClientID is the browser-generated UUID stored in localStorage. Lets us
	// tie a user's submissions across requests (and across ideas + comments)
	// without requiring login. Never returned to the public list.
	ClientID string `gorm:"type:varchar(64);index" json:"-"`
	Status   string `gorm:"type:varchar(16);not null;default:'pending';index:idx_status_created,priority:1" json:"-"`
}

func (Idea) TableName() string { return "docbackend_ideas" }

// Comment is a flat reply to a public idea. Default status is 'public' —
// comments are lower risk than idea bodies, and rate-limit + sanitization
// already gate the obvious abuse. You hide bad ones manually via psql.
type Comment struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	IdeaID    uint      `gorm:"not null;index:idx_idea_status,priority:1" json:"-"`
	// Author kept for compatibility with already-stored rows. v2 of the UI no
	// longer asks for a nickname — new rows leave it empty and we render all
	// comments uniformly as "匿名 / Anonymous" client-side.
	Author string `gorm:"type:varchar(80)" json:"-"`
	Body   string `gorm:"type:varchar(1000);not null" json:"body"`
	IPHash string `gorm:"type:varchar(64);not null;index" json:"-"`
	// ClientID is the same browser UUID stored by Idea — lets you trace a
	// thread of comments back to their poster for moderation, and lets the
	// browser flag "this is mine" without a login.
	ClientID string `gorm:"type:varchar(64);index" json:"-"`
	Status   string `gorm:"type:varchar(16);not null;default:'public';index:idx_idea_status,priority:2" json:"-"`
}

func (Comment) TableName() string { return "docbackend_comments" }

// AskLog is the persistent record of every /api/ask round-trip. Browser-side
// chat history (in localStorage) is for UX only — clearing it doesn't touch
// these rows. The owner uses this table to spot common questions, monitor
// upstream errors, and gauge load over time.
type AskLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
	ClientID   string    `gorm:"type:varchar(64);not null;index" json:"-"`
	IPHash     string    `gorm:"type:varchar(64);not null" json:"-"`
	Lang       string    `gorm:"type:varchar(8);not null" json:"lang"`
	Question   string    `gorm:"type:varchar(2000);not null" json:"question"`
	ImageCount int       `gorm:"not null;default:0" json:"imageCount"`
	// RetrievedSlugs is a JSON-encoded []string — the cumulative set of doc
	// slugs the agent retrieved across all tool-call iterations. Plain text
	// column instead of JSONB to keep this portable across PG versions and
	// to avoid GORM's JSONB-pointer noise.
	RetrievedSlugs string `gorm:"type:text" json:"-"`
	Answer         string `gorm:"type:text" json:"answer"`
	Thinking       string `gorm:"type:text" json:"-"`
	ToolCallCount  int    `gorm:"not null;default:0" json:"toolCallCount"`
	Errored        bool   `gorm:"not null;default:false" json:"errored"`
	ErrorMsg       string `gorm:"type:text" json:"-"`
	DurationMs     int    `gorm:"not null;default:0" json:"durationMs"`
}

func (AskLog) TableName() string { return "docbackend_ask_logs" }
