package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL    string
	Port           string
	BaseURL        string
	JwtSecret      string
	RedisAddr      string
	GoogleClientID string
}

func Load() (*Config, error) {

	var cfg = &Config{}
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL environment variable is required")
	}

	cfg.Port = os.Getenv("PORT")
	if cfg.Port == "" {
		cfg.Port = ":8000"
	} else if !strings.HasPrefix(cfg.Port, ":") {
		cfg.Port = ":" + cfg.Port
	}
	cfg.BaseURL = os.Getenv("BASE_URL")
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:8000"
	}
	cfg.JwtSecret = os.Getenv("JWT_SECRET")
	if cfg.JwtSecret == "" {
		return nil, errors.New("JWT_SECRET environment variable is required")
	}

	cfg.RedisAddr = os.Getenv("REDIS_ADDR")
	if cfg.RedisAddr == "" {
		cfg.RedisAddr = "localhost:6379"
	}

	cfg.GoogleClientID = os.Getenv("GOOGLE_CLIENT_ID")
	if cfg.GoogleClientID == "" {
		cfg.GoogleClientID = "522031681947-n509q6tl9f6k3ottib6h9ojir8lhh7jc.apps.googleusercontent.com"
	}

	return cfg, nil
}
