package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func requestFrom(remoteAddr, xff string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = remoteAddr
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	return req
}

// TestIPResolver_IgnoresForwardedHeaderFromUntrustedPeer is the regression test
// for rate-limit evasion: a client connecting directly must not be able to pick
// its own bucket by sending a header.
func TestIPResolver_IgnoresForwardedHeaderFromUntrustedPeer(t *testing.T) {
	resolver, err := NewIPResolver(nil)
	if err != nil {
		t.Fatalf("NewIPResolver: %v", err)
	}

	tests := []struct {
		name       string
		remoteAddr string
		xff        string
		want       string
	}{
		{
			name:       "spoofed single hop is ignored",
			remoteAddr: "203.0.113.9:51234",
			xff:        "1.2.3.4",
			want:       "203.0.113.9",
		},
		{
			name:       "spoofed chain is ignored",
			remoteAddr: "203.0.113.9:51234",
			xff:        "1.2.3.4, 5.6.7.8, 9.10.11.12",
			want:       "203.0.113.9",
		},
		{
			name:       "loopback-claiming spoof is ignored",
			remoteAddr: "203.0.113.9:51234",
			xff:        "127.0.0.1",
			want:       "203.0.113.9",
		},
		{
			name:       "no header falls back to the socket",
			remoteAddr: "203.0.113.9:51234",
			want:       "203.0.113.9",
		},
		{
			name:       "ipv6 peer",
			remoteAddr: "[2001:db8::1]:51234",
			xff:        "1.2.3.4",
			want:       "2001:db8::1",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolver.ClientIP(requestFrom(tc.remoteAddr, tc.xff)); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// TestIPResolver_HonoursForwardedHeaderFromTrustedProxy checks the other half:
// behind a trusted edge proxy the real client must still be identifiable, or the
// whole platform would share one rate-limit bucket.
func TestIPResolver_HonoursForwardedHeaderFromTrustedProxy(t *testing.T) {
	resolver, err := NewIPResolver(nil)
	if err != nil {
		t.Fatalf("NewIPResolver: %v", err)
	}

	tests := []struct {
		name       string
		remoteAddr string
		xff        string
		want       string
	}{
		{
			name:       "single client hop",
			remoteAddr: "10.0.0.5:40000",
			xff:        "203.0.113.9",
			want:       "203.0.113.9",
		},
		{
			name:       "rightmost untrusted hop wins over client-appended entries",
			remoteAddr: "10.0.0.5:40000",
			xff:        "1.2.3.4, 203.0.113.9",
			want:       "203.0.113.9",
		},
		{
			name:       "trailing trusted proxies are skipped",
			remoteAddr: "10.0.0.5:40000",
			xff:        "203.0.113.9, 10.0.0.7, 172.16.0.2",
			want:       "203.0.113.9",
		},
		{
			name:       "garbage entries are skipped",
			remoteAddr: "127.0.0.1:40000",
			xff:        "203.0.113.9, not-an-ip",
			want:       "203.0.113.9",
		},
		{
			name:       "all-trusted chain falls back to the peer",
			remoteAddr: "10.0.0.5:40000",
			xff:        "10.0.0.6, 10.0.0.7",
			want:       "10.0.0.5",
		},
		{
			name:       "no header falls back to the peer",
			remoteAddr: "10.0.0.5:40000",
			want:       "10.0.0.5",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolver.ClientIP(requestFrom(tc.remoteAddr, tc.xff)); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestIPResolver_ExplicitCIDRs(t *testing.T) {
	resolver, err := NewIPResolver([]string{"198.51.100.0/24"})
	if err != nil {
		t.Fatalf("NewIPResolver: %v", err)
	}

	t.Run("configured proxy is trusted", func(t *testing.T) {
		got := resolver.ClientIP(requestFrom("198.51.100.7:40000", "203.0.113.9"))
		if got != "203.0.113.9" {
			t.Fatalf("got %q, want the forwarded client", got)
		}
	})

	t.Run("private range is no longer trusted once overridden", func(t *testing.T) {
		got := resolver.ClientIP(requestFrom("10.0.0.5:40000", "203.0.113.9"))
		if got != "10.0.0.5" {
			t.Fatalf("got %q, want the socket address", got)
		}
	})
}

func TestIPResolver_TrustAll(t *testing.T) {
	resolver, err := NewIPResolver([]string{"*"})
	if err != nil {
		t.Fatalf("NewIPResolver: %v", err)
	}

	t.Run("leftmost hop is taken", func(t *testing.T) {
		got := resolver.ClientIP(requestFrom("203.0.113.9:40000", "1.2.3.4, 5.6.7.8"))
		if got != "1.2.3.4" {
			t.Fatalf("got %q, want %q", got, "1.2.3.4")
		}
	})

	t.Run("no header falls back to the socket", func(t *testing.T) {
		got := resolver.ClientIP(requestFrom("203.0.113.9:40000", ""))
		if got != "203.0.113.9" {
			t.Fatalf("got %q, want %q", got, "203.0.113.9")
		}
	})
}

func TestNewIPResolver_RejectsMalformedCIDR(t *testing.T) {
	if _, err := NewIPResolver([]string{"not-a-cidr"}); err == nil {
		t.Fatal("a malformed CIDR was accepted")
	}
	// A bare address is not a prefix and must be rejected rather than silently ignored.
	if _, err := NewIPResolver([]string{"10.0.0.1"}); err == nil {
		t.Fatal("a bare address was accepted as a CIDR")
	}
}
