package config

import (
	"errors"
	"os"
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

	return cfg, nil
}
