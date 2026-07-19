package config

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL string
	Port        string
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

	return cfg, nil
}
