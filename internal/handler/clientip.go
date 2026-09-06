package handler

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// defaultTrustedProxies is the fallback trust set: loopback plus the private and
// link-local ranges a container platform's edge proxy normally connects from.
// Anything outside it is treated as a direct, untrusted client whose
// X-Forwarded-For header is ignored.
var defaultTrustedProxies = []string{
	"127.0.0.0/8",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"169.254.0.0/16",
	"::1/128",
	"fc00::/7",
	"fe80::/10",
}

// IPResolver derives the address a request should be attributed to.
//
// X-Forwarded-For is client-supplied and therefore forgeable. Honouring it
// unconditionally lets anyone reset their own rate-limit bucket by rotating the
// header, so the header is only consulted when the immediate peer is a proxy we
// have been configured to trust.
type IPResolver struct {
	trustAll bool
	trusted  []netip.Prefix
}

// NewIPResolver builds a resolver from a list of CIDR blocks. An empty list falls
// back to defaultTrustedProxies. The single entry "*" trusts every peer, which is
// required when the platform's edge proxy connects from a public address; it
// re-opens header spoofing and should only be set when the service is genuinely
// unreachable except through that proxy.
func NewIPResolver(cidrs []string) (*IPResolver, error) {
	cleaned := make([]string, 0, len(cidrs))
	for _, c := range cidrs {
		if c = strings.TrimSpace(c); c != "" {
			cleaned = append(cleaned, c)
		}
	}
	if len(cleaned) == 0 {
		cleaned = defaultTrustedProxies
	}

	r := &IPResolver{}
	for _, c := range cleaned {
		if c == "*" {
			r.trustAll = true
			continue
		}
		prefix, err := netip.ParsePrefix(c)
		if err != nil {
			return nil, fmt.Errorf("trusted proxy %q: %w", c, err)
		}
		r.trusted = append(r.trusted, prefix.Masked())
	}
	return r, nil
}

func (r *IPResolver) isTrusted(addr netip.Addr) bool {
	addr = addr.Unmap()
	for _, prefix := range r.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// ClientIP returns the best available client address for logging and rate limiting.
//
// When the peer is a trusted proxy the forwarded chain is walked from right to
// left and the first untrusted hop wins: entries to its left were appended by the
// client itself and cannot be believed. When the peer is not trusted the header is
// ignored entirely and the socket address is used.
func (r *IPResolver) ClientIP(req *http.Request) string {
	remote := remoteAddrHost(req)

	if r.trustAll {
		if first, ok := firstForwardedFor(req); ok {
			return first
		}
		return remote
	}

	peer, err := netip.ParseAddr(remote)
	if err != nil || !r.isTrusted(peer) {
		return remote
	}

	hops := strings.Split(req.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil || r.isTrusted(addr) {
			continue
		}
		return addr.Unmap().String()
	}

	// Every hop was a trusted proxy (or the header was absent): the peer itself is
	// the closest thing to a client we can name.
	return remote
}

func firstForwardedFor(req *http.Request) (string, bool) {
	xff := req.Header.Get("X-Forwarded-For")
	if xff == "" {
		return "", false
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(strings.SplitN(xff, ",", 2)[0]))
	if err != nil {
		return "", false
	}
	return addr.Unmap().String(), true
}

func remoteAddrHost(req *http.Request) string {
	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		return req.RemoteAddr
	}
	return host
}
