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
	os.Unsetenv("PORT")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("DB url is not set ")
	}
	if cfg.DatabaseURL != "postgres/test" {
		t.Fatal("cfg is nil")
	}

	if cfg.Port != ":8000" {
		t.Fatal("Port number is different")
	}
}
