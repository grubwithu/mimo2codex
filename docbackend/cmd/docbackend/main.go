// docbackend is the small Go service that powers the mimodoc.chengj.online
// extras: the public ideas board, idea comments, and the doc-grounded AI
// assistant. It runs alongside the static docweb site and is exposed via
// nginx at /api/*.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/go-kratos/kratos/v2"
	"github.com/go-kratos/kratos/v2/log"

	"github.com/7as0nch/mimo2codex/docbackend/internal/biz"
	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
	"github.com/7as0nch/mimo2codex/docbackend/internal/data"
	"github.com/7as0nch/mimo2codex/docbackend/internal/server"
	"github.com/7as0nch/mimo2codex/docbackend/internal/service"
)

var (
	flagConf = flag.String("conf", "configs/config.yaml", "path to config.yaml")
)

func main() {
	flag.Parse()

	lg := log.With(log.NewStdLogger(os.Stdout),
		"ts", log.DefaultTimestamp,
		"caller", log.DefaultCaller,
		"service", "docbackend",
	)
	helper := log.NewHelper(lg)

	cfgPath, err := filepath.Abs(*flagConf)
	if err != nil {
		helper.Fatalf("resolve config path: %v", err)
	}
	cfg, err := conf.Load(cfgPath)
	if err != nil {
		helper.Fatalf("load config: %v", err)
	}

	// ─── Data layer ────────────────────────────────────────────────────────
	d, dCleanup, err := data.NewData(&cfg.Data.Postgres, lg)
	if err != nil {
		helper.Fatalf("init data: %v", err)
	}
	defer dCleanup()

	ideaRepo := data.NewIdeaRepo(d)
	commentRepo := data.NewCommentRepo(d)
	askLogRepo := data.NewAskLogRepo(d)

	// docsDir resolution priority:
	//   1. DOCBACKEND_DOCS_DIR env (absolute path, used by deploys)
	//   2. config value, treated as relative to the config file's directory
	//   3. fallback: ../doc relative to the binary's cwd
	docsDir := os.Getenv("DOCBACKEND_DOCS_DIR")
	if docsDir == "" {
		docsDir = cfg.Data.DocsDir
	}
	if !filepath.IsAbs(docsDir) {
		docsDir = filepath.Join(filepath.Dir(cfgPath), docsDir)
	}
	docs, err := data.LoadDocs(docsDir)
	if err != nil {
		helper.Fatalf("load docs from %s: %v", docsDir, err)
	}
	helper.Infof("loaded docs: en=%d, zh=%d (dir=%s)", len(docs.EN), len(docs.ZH), docsDir)

	upstream := data.NewUpstreamClient(&cfg.Upstream)

	// ─── Business layer ────────────────────────────────────────────────────
	ideaUC := biz.NewIdeaUsecase(ideaRepo, &cfg.RateLimit)
	commentUC := biz.NewCommentUsecase(commentRepo, ideaRepo, &cfg.RateLimit)
	askUC := biz.NewAskUsecase(docs, upstream, askLogRepo, &cfg.Ask, &cfg.RateLimit, lg)

	// ─── Service layer ─────────────────────────────────────────────────────
	ideaSvc := service.NewIdeaService(ideaUC, &cfg.Security)
	commentSvc := service.NewCommentService(commentUC, &cfg.Security)
	askSvc := service.NewAskService(askUC, &cfg.Security)

	// ─── HTTP server ───────────────────────────────────────────────────────
	httpSrv := server.Build(
		&cfg.Server.HTTP,
		&cfg.CORS,
		docs,
		ideaSvc,
		commentSvc,
		askSvc,
		lg,
	)

	app := kratos.New(
		kratos.Name("docbackend"),
		kratos.Logger(lg),
		kratos.Server(httpSrv),
	)

	helper.Infof("docbackend listening on %s", cfg.Server.HTTP.Addr)
	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "app run:", err)
		os.Exit(1)
	}
}
