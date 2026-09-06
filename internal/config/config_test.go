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
	os.Setenv("GOOGLE_CLIENT_ID", "test-google-client-id")
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
	if cfg.GoogleClientID != "test-google-client-id" {
		t.Fatalf("Expected GoogleClientID test-google-client-id, got %s", cfg.GoogleClientID)
	}
}

func TestLoad_PortWithoutColon(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres/test")
	os.Setenv("JWT_SECRET", "test-secret")
	os.Setenv("GOOGLE_CLIENT_ID", "test-google-client-id")
	os.Setenv("PORT", "10000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}
	if cfg.Port != ":10000" {
		t.Fatalf("Expected port :10000, got %s", cfg.Port)
	}
}

func TestLoad_MissingGoogleClientID(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres/test")
	t.Setenv("JWT_SECRET", "test-secret")
	os.Unsetenv("GOOGLE_CLIENT_ID")

	cfg, err := Load()
	if err == nil {
		t.Fatal("expected error for missing GOOGLE_CLIENT_ID, got nil")
	}
	if cfg != nil {
		t.Fatal("expected nil cfg, got non-nil")
	}
}

func TestLoad_TrustedProxies(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want []string
	}{
		{name: "unset leaves the resolver on its defaults", env: "", want: nil},
		{name: "single cidr", env: "10.0.0.0/8", want: []string{"10.0.0.0/8"}},
		{name: "comma separated", env: "10.0.0.0/8,192.168.0.0/16", want: []string{"10.0.0.0/8", "192.168.0.0/16"}},
		{name: "whitespace is trimmed", env: " 10.0.0.0/8 , 192.168.0.0/16 ", want: []string{"10.0.0.0/8", "192.168.0.0/16"}},
		{name: "empty entries are dropped", env: "10.0.0.0/8,,", want: []string{"10.0.0.0/8"}},
		{name: "wildcard is passed through", env: "*", want: []string{"*"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgres/test")
			t.Setenv("JWT_SECRET", "test-secret")
			t.Setenv("GOOGLE_CLIENT_ID", "test-google-client-id")
			t.Setenv("TRUSTED_PROXIES", tc.env)

			cfg, err := Load()
			if err != nil {
				t.Fatalf("Load error: %v", err)
			}

			if len(cfg.TrustedProxies) != len(tc.want) {
				t.Fatalf("got %#v, want %#v", cfg.TrustedProxies, tc.want)
			}
			for i, want := range tc.want {
				if cfg.TrustedProxies[i] != want {
					t.Errorf("entry %d: got %q, want %q", i, cfg.TrustedProxies[i], want)
				}
			}
		})
	}
}

func TestLoad_RateLimitFailOpen(t *testing.T) {
	tests := []struct {
		name    string
		env     string
		setEnv  bool
		wantVal bool
		wantErr bool
	}{
		{name: "unset defaults to false", setEnv: false, wantVal: false, wantErr: false},
		{name: "empty string defaults to false", env: "", setEnv: true, wantVal: false, wantErr: false},
		{name: "true string parses to true", env: "true", setEnv: true, wantVal: true, wantErr: false},
		{name: "1 parses to true", env: "1", setEnv: true, wantVal: true, wantErr: false},
		{name: "false string parses to false", env: "false", setEnv: true, wantVal: false, wantErr: false},
		{name: "0 parses to false", env: "0", setEnv: true, wantVal: false, wantErr: false},
		{name: "typo returns error", env: "ture", setEnv: true, wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgres/test")
			t.Setenv("JWT_SECRET", "test-secret")
			t.Setenv("GOOGLE_CLIENT_ID", "test-google-client-id")
			if tc.setEnv {
				t.Setenv("RATE_LIMIT_FAIL_OPEN", tc.env)
			} else {
				os.Unsetenv("RATE_LIMIT_FAIL_OPEN")
			}

			cfg, err := Load()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for RATE_LIMIT_FAIL_OPEN=%q, got nil", tc.env)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.RateLimitFailOpen != tc.wantVal {
				t.Fatalf("expected RateLimitFailOpen=%v, got %v", tc.wantVal, cfg.RateLimitFailOpen)
			}
		})
	}
}
