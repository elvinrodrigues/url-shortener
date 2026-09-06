package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL       string
	Port              string
	BaseURL           string
	JwtSecret         string
	RedisAddr         string
	GoogleClientID    string
	RateLimitFailOpen bool
	// TrustedProxies lists the CIDR blocks whose X-Forwarded-For headers may be
	// believed when attributing a request to a client IP. Empty means "use the
	// loopback/private defaults"; a single "*" trusts every peer.
	TrustedProxies []string
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
		return nil, errors.New("GOOGLE_CLIENT_ID environment variable is required")
	}

	if raw := os.Getenv("TRUSTED_PROXIES"); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			if part = strings.TrimSpace(part); part != "" {
				cfg.TrustedProxies = append(cfg.TrustedProxies, part)
			}
		}
	}

	if raw := os.Getenv("RATE_LIMIT_FAIL_OPEN"); raw != "" {
		val, err := strconv.ParseBool(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid RATE_LIMIT_FAIL_OPEN: %w", err)
		}
		cfg.RateLimitFailOpen = val
	}

	return cfg, nil
}
