package data

import (
	"fmt"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
)

// Data is the shared dependency bundle for all repos. Currently just *gorm.DB,
// but kept as a struct so adding a cache / metrics client later doesn't
// ripple through every repo constructor.
type Data struct {
	DB     *gorm.DB
	logger *log.Helper
}

func NewData(c *conf.Postgres, lg log.Logger) (*Data, func(), error) {
	if c.DSN == "" {
		return nil, nil, fmt.Errorf("postgres DSN is empty — set DOCBACKEND_DSN")
	}

	gormConf := &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	}
	db, err := gorm.Open(postgres.Open(c.DSN), gormConf)
	if err != nil {
		return nil, nil, fmt.Errorf("open postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, nil, fmt.Errorf("db handle: %w", err)
	}
	if c.MaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(c.MaxOpenConns)
	}
	if c.MaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(c.MaxIdleConns)
	}
	if c.ConnMaxLifetimeSec > 0 {
		sqlDB.SetConnMaxLifetime(time.Duration(c.ConnMaxLifetimeSec) * time.Second)
	}
	if err := sqlDB.Ping(); err != nil {
		return nil, nil, fmt.Errorf("postgres ping: %w", err)
	}

	if err := db.AutoMigrate(&Idea{}, &Comment{}, &AskLog{}); err != nil {
		return nil, nil, fmt.Errorf("auto migrate: %w", err)
	}

	d := &Data{DB: db, logger: log.NewHelper(lg)}
	d.logger.Info("postgres connected and migrated: docbackend_ideas, docbackend_comments, docbackend_ask_logs")

	cleanup := func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	return d, cleanup, nil
}
