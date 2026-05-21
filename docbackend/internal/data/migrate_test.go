package data

import (
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// TestAutoMigrate creates / migrates docbackend_ideas and docbackend_comments
// against the database at $DOCBACKEND_TEST_DSN. Run it once after bootstrap
// to provision the tables, and again any time the model changes — AutoMigrate
// is idempotent and additive (it adds columns/indexes, never drops).
//
// Usage (PowerShell):
//
//	$env:DOCBACKEND_TEST_DSN = "postgres://user:pass@localhost:5432/mydb?sslmode=disable"
//	go test -v -run TestAutoMigrate ./internal/data
func TestAutoMigrate(t *testing.T) {
	dsn := os.Getenv("DOCBACKEND_TEST_DSN")
	if dsn == "" {
		t.Skip("set DOCBACKEND_TEST_DSN to run (e.g. postgres://user:pass@host:5432/db?sslmode=disable)")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	if err := db.AutoMigrate(&Idea{}, &Comment{}, &AskLog{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	for _, m := range []any{&Idea{}, &Comment{}, &AskLog{}} {
		if !db.Migrator().HasTable(m) {
			t.Fatalf("table missing after AutoMigrate: %T", m)
		}
	}
	t.Logf("OK: tables %s, %s, %s created/migrated",
		(Idea{}).TableName(), (Comment{}).TableName(), (AskLog{}).TableName())
}
