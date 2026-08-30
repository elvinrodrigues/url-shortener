package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
)

type URLHandler struct {
	serv    domain.URLService
	baseURL string
}

type CreateURLResponse struct {
	ShortURL  string `json:"short_url"`
	ShortCode string `json:"short_code"`
}

type GetStatsResponse struct {
	ShortCode  string     `json:"short_code"`
	LongURL    string     `json:"long_url"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	ClickCount int64      `json:"click_count"`
	IsActive   bool       `json:"is_active"`
}

type CreateURLRequest struct {
}

func New(s domain.URLService, url string) *URLHandler {
	return &URLHandler{
		serv:    s,
		baseURL: url,
	}
}

func (h *URLHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (h *URLHandler) Shorten(w http.ResponseWriter, r *http.Request) {
	var req = domain.CreateURLRequest{}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.UserID = userIDFromContext(r.Context())

	url, err := h.serv.Shorten(r.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLDuplicate):
			writeJSONError(w, http.StatusConflict, "Short code already in use")
		case errors.Is(err, domain.ErrURLInvalid):
			writeJSONError(w, http.StatusUnprocessableEntity, "Invalid URL provided")
		case errors.Is(err, domain.ErrCustomCodeInvalid):
			writeJSONError(w, http.StatusUnprocessableEntity, "Invalid custom code format")
		case errors.Is(err, domain.ErrCustomCodeReserved):
			writeJSONError(w, http.StatusUnprocessableEntity, "That custom alias is a reserved system keyword. Please choose another alias.")
		case errors.Is(err, domain.ErrURLShortenFailed):
			writeJSONError(w, http.StatusServiceUnavailable, "Failed to generate short URL. Try again later.")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}
	shortURL := h.baseURL + "/" + url.ShortCode
	response := CreateURLResponse{
		ShortURL:  shortURL,
		ShortCode: url.ShortCode,
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Location", shortURL)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(response)
}

func (h *URLHandler) Redirect(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")

	longURL, err := h.serv.Redirect(r.Context(), code)
	if err != nil {
		accept := r.Header.Get("Accept")
		isBrowser := strings.Contains(accept, "text/html")

		// 1. Browser traffic: Render direct HTML 404/410 page without changing the URL
		if isBrowser {
			isExpired := errors.Is(err, domain.ErrURLExpired)
			statusCode := http.StatusNotFound
			if isExpired {
				statusCode = http.StatusGone
			}

			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(statusCode)
			renderErrorHTML(w, code, isExpired)
			return
		}

		// 2. API / curl traffic: Return structured JSON error
		switch {
		case errors.Is(err, domain.ErrURLExpired):
			writeJSONError(w, http.StatusGone, "Short URL has expired")
		case errors.Is(err, domain.ErrURLNotFound):
			writeJSONError(w, http.StatusNotFound, "Short URL not found")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}

	http.Redirect(w, r, longURL, http.StatusFound)
}

func (h *URLHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	if userID == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	code := r.PathValue("code")

	err := h.serv.Delete(r.Context(), code, *userID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLNotFound):
			writeJSONError(w, http.StatusNotFound, "Short URL not found or already deleted")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *URLHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")

	userID := userIDFromContext(r.Context())
	if userID == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	url, err := h.serv.GetStats(r.Context(), code, *userID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLNotFound):
			writeJSONError(w, http.StatusNotFound, "Short URL not found")
		case errors.Is(err, domain.ErrURLForbidden):
			writeJSONError(w, http.StatusForbidden, "You do not have access to view stats for this URL")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}
	response := GetStatsResponse{
		ShortCode:  url.ShortCode,
		LongURL:    url.LongURL,
		ClickCount: url.ClickCount,
		CreatedAt:  url.CreatedAt,
		ExpiresAt:  url.ExpiresAt,
		IsActive:   url.IsActive,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func (h *URLHandler) GetUserURLs(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r.Context())
	if userID == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	urls, err := h.serv.GetUserURLs(r.Context(), *userID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	var response []GetStatsResponse
	for _, u := range urls {
		response = append(response, GetStatsResponse{
			ShortCode:  u.ShortCode,
			LongURL:    u.LongURL,
			ClickCount: u.ClickCount,
			CreatedAt:  u.CreatedAt,
			ExpiresAt:  u.ExpiresAt,
			IsActive:   u.IsActive,
		})
	}
	if response == nil {
		response = []GetStatsResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func renderErrorHTML(w http.ResponseWriter, code string, isExpired bool) {
	badgeText := "404 // LINK NOT FOUND"
	badgeClass := "badge-error"
	title := "Destination unreachable"
	desc := "The short link you are attempting to visit does not exist, was mistyped, or has been removed."
	iconColor := "#FF5A00"
	iconBg := "rgba(255, 90, 0, 0.1)"
	iconBorder := "rgba(255, 90, 0, 0.25)"
	iconShadow := "0 0 28px -2px rgba(255, 90, 0, 0.3)"
	iconSVG := `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71a4.5 4.5 0 0 0-6.36-6.37l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a4.5 4.5 0 0 0 6.36 6.37l1.71-1.72"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`

	if isExpired {
		badgeText = "410 // LINK EXPIRED"
		badgeClass = "badge-warning"
		title = "This link has expired"
		desc = "This short link has reached its scheduled expiration date and is no longer redirecting."
		iconColor = "#F59E0B"
		iconBg = "rgba(245, 158, 11, 0.1)"
		iconBorder = "rgba(245, 158, 11, 0.25)"
		iconShadow = "0 0 28px -2px rgba(245, 158, 11, 0.3)"
		iconSVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%s • Slug</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;700;800&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #09090b;
      color: #EDEDED;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px;
      position: relative;
      overflow-x: hidden;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 50%%;
      transform: translateX(-50%%);
      width: 100vw;
      height: 520px;
      background: radial-gradient(circle at 50%% 0%%, rgba(255, 90, 0, 0.22) 0%%, rgba(255, 140, 0, 0.05) 50%%, transparent 75%%);
      pointer-events: none;
      z-index: 0;
    }
    .header-logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      background: rgba(18, 18, 22, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      margin-bottom: 32px;
      text-decoration: none;
      color: #FFFFFF;
      position: relative;
      z-index: 1;
      font-family: 'Bricolage Grotesque', sans-serif;
      font-weight: 800;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 90, 0, 0.08);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      transition: all 0.25s ease;
    }
    .header-logo:hover {
      border-color: rgba(255, 90, 0, 0.4);
      background: rgba(26, 26, 32, 0.95);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 90, 0, 0.2);
      transform: translateY(-1px);
    }
    .header-logo-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(255, 90, 0, 0.12);
      color: #FF5A00;
      border: 1px solid rgba(255, 90, 0, 0.28);
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .card {
      background: rgba(15, 15, 18, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 22px;
      padding: 44px 34px 40px;
      text-align: center;
      max-width: 520px;
      width: 100%%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      position: relative;
      z-index: 1;
      box-shadow: 0 20px 50px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 90, 0, 0.05);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      animation: appear 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 15%%;
      right: 15%%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 90, 0, 0.4), rgba(255, 255, 255, 0.3), rgba(255, 90, 0, 0.4), transparent);
    }
    @keyframes appear {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .icon-wrapper {
      width: 64px;
      height: 64px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: %s;
      background: %s;
      border: 1px solid %s;
      box-shadow: %s;
      margin-bottom: 2px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.725rem;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .badge-error { background: rgba(255, 90, 0, 0.1); color: #FF5A00; border: 1px solid rgba(255, 90, 0, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.1); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-dot { width: 6px; height: 6px; border-radius: 50%%; background: currentColor; box-shadow: 0 0 6px currentColor; }
    h1 {
      font-family: 'Bricolage Grotesque', sans-serif;
      font-size: 1.95rem;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.025em;
    }
    .slug-box {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 7px 16px;
      background: #08080a;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      margin: 2px 0;
    }
    .slug-label { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: #8E8E93; font-weight: 700; letter-spacing: 0.08em; }
    .slug-val { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; font-weight: 700; color: #FF5A00; }
    p { color: #8E8E93; font-size: 0.925rem; line-height: 1.6; max-width: 420px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 26px;
      border-radius: 9999px;
      background: linear-gradient(135deg, #FF4500 0%%, #FF5A00 50%%, #F59E0B 100%%);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #FFFFFF;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
      margin-top: 8px;
      box-shadow: 0 4px 18px 0 rgba(255, 90, 0, 0.38);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 26px 0 rgba(255, 90, 0, 0.55);
      border-color: rgba(255, 255, 255, 0.35);
      filter: brightness(1.06);
    }
    .footer-note {
      margin-top: 40px;
      font-size: 0.8rem;
      color: #636366;
      text-align: center;
      position: relative;
      z-index: 1;
      line-height: 1.6;
    }
    .footer-note a { color: #8e8e93; text-decoration: none; }
    .footer-note a:hover { color: #f5f5f7; }
  </style>
</head>
<body>
  <a href="/" class="header-logo">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    <span>Slug</span>
    <span class="header-logo-badge">URL SHORTENER</span>
  </a>

  <div class="card">
    <div class="icon-wrapper">%s</div>
    <div class="badge %s"><span class="status-dot"></span>%s</div>
    <h1>%s</h1>
    <div class="slug-box">
      <span class="slug-label">TARGET PATH</span>
      <span class="slug-val">/%s</span>
    </div>
    <p>%s</p>
    <a href="/" class="btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      Shorten a New Link
    </a>
  </div>

  <div class="footer-note">
    <p>Don't shorten links to illegal, phishing, or harmful content.</p>
    <p style="font-family: 'JetBrains Mono', monospace; font-size: 0.725rem; margin-top: 4px;">Elvin Rodrigues — Slug • Go 1.26+ • PostgreSQL • Redis</p>
  </div>
</body>
</html>`, title, iconColor, iconBg, iconBorder, iconShadow, iconSVG, badgeClass, badgeText, title, code, desc)

	w.Write([]byte(html))
}

