package config

import (
	"os"
	"testing"
)

func TestLoad_MissingDatabaseURL(t *testing.T) {
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("PORT")

	cfg, err := Load()

	if err == nil {
		t.Fatalf("DB url is set ")
		return
	}
	if cfg != nil {
		t.Fatal("cfg is not nil")
	}
}

func TestLoad_Success(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres/test")
	os.Setenv("JWT_SECRET", "test-secret")
	os.Unsetenv("PORT")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("DB url is not set: %v", err)
	}
	if cfg.DatabaseURL != "postgres/test" {
		t.Fatal("cfg is nil")
	}

	if cfg.Port != ":8000" {
		t.Fatal("Port number is different")
	}
}

func TestLoad_PortWithoutColon(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres/test")
	os.Setenv("JWT_SECRET", "test-secret")
	os.Setenv("PORT", "10000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}
	if cfg.Port != ":10000" {
		t.Fatalf("Expected port :10000, got %s", cfg.Port)
	}
}
