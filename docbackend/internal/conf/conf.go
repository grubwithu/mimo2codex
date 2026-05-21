// Package conf parses configs/config.yaml into typed structs. We use plain
// yaml + env-substitution instead of the Kratos protobuf config workflow —
// the service has under a dozen settings and protobuf scaffolding is heavier
// than the payoff at this scale.
package conf

import (
	"fmt"
	"os"
	"regexp"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    Server    `yaml:"server"`
	Data      Data      `yaml:"data"`
	Upstream  Upstream  `yaml:"upstream"`
	RateLimit RateLimit `yaml:"ratelimit"`
	CORS      CORS      `yaml:"cors"`
	Security  Security  `yaml:"security"`
	Ask       Ask       `yaml:"ask"`
}

type Server struct {
	HTTP HTTPServer `yaml:"http"`
}

type HTTPServer struct {
	Addr    string        `yaml:"addr"`
	Timeout time.Duration `yaml:"timeout"`
}

type Data struct {
	Postgres Postgres `yaml:"postgres"`
	DocsDir  string   `yaml:"docsDir"`
}

type Postgres struct {
	DSN                string `yaml:"dsn"`
	MaxOpenConns       int    `yaml:"maxOpenConns"`
	MaxIdleConns       int    `yaml:"maxIdleConns"`
	ConnMaxLifetimeSec int    `yaml:"connMaxLifetimeSec"`
}

type Upstream struct {
	BaseURL string        `yaml:"baseURL"`
	APIKey  string        `yaml:"apiKey"`
	Model   string        `yaml:"model"`
	Timeout time.Duration `yaml:"timeout"`
}

type RateLimit struct {
	IdeasPerMinute    int `yaml:"ideasPerMinute"`
	IdeasPerDay       int `yaml:"ideasPerDay"`
	CommentsPerMinute int `yaml:"commentsPerMinute"`
	CommentsPerDay    int `yaml:"commentsPerDay"`
	AskPerMinute      int `yaml:"askPerMinute"`
	AskPerDay         int `yaml:"askPerDay"`
}

type CORS struct {
	AllowOrigins []string `yaml:"allowOrigins"`
}

type Security struct {
	IPSalt string `yaml:"ipSalt"`
}

type Ask struct {
	MaxTokens      int    `yaml:"maxTokens"`
	SystemPromptZh string `yaml:"systemPromptZh"`
	SystemPromptEn string `yaml:"systemPromptEn"`
}

// Load reads the file, expands ${VAR} placeholders against process env, and
// parses YAML. Unset env vars expand to an empty string — the caller can
// validate required ones (DSN, API key) separately.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	expanded := expandEnv(raw)

	var c Config
	if err := yaml.Unmarshal(expanded, &c); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	return &c, nil
}

var envRefRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

func expandEnv(in []byte) []byte {
	return envRefRe.ReplaceAllFunc(in, func(m []byte) []byte {
		name := envRefRe.FindSubmatch(m)[1]
		return []byte(os.Getenv(string(name)))
	})
}
