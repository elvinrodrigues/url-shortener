package handler

import (
	"encoding/json"
	"errors"
	"net/http"
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
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (h *URLHandler) Shorten(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req = domain.CreateURLRequest{}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	req.UserID = userIDFromContext(r.Context())

	url, err := h.serv.Shorten(r.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLDuplicate):
			w.WriteHeader(http.StatusConflict)
		case errors.Is(err, domain.ErrURLInvalid):
			w.WriteHeader(http.StatusUnprocessableEntity)
		case errors.Is(err, domain.ErrCustomCodeInvalid):
			w.WriteHeader(http.StatusUnprocessableEntity)
		case errors.Is(err, domain.ErrCustomCodeReserved):
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"error": "That custom alias is a reserved system keyword. Please choose another alias."})
		case errors.Is(err, domain.ErrURLShortenFailed):
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
		return
	}
	shortURL := h.baseURL + "/" + url.ShortCode
	response := CreateURLResponse{
		ShortURL:  shortURL,
		ShortCode: url.ShortCode,
	}
	w.Header().Set("Location", shortURL)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)

}

func (h *URLHandler) Redirect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	code := r.PathValue("code")
	// t := time.Now()

	longURL, err := h.serv.Redirect(r.Context(), code)
	// log.Println("Time :",time.Since(t))
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLExpired):
			w.WriteHeader(http.StatusGone)
		case errors.Is(err, domain.ErrURLNotFound):
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
		return
	}
	http.Redirect(w, r, longURL, http.StatusFound)
}

func (h *URLHandler) Delete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := userIDFromContext(r.Context())
	if userID == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	code := r.PathValue("code")

	err := h.serv.Delete(r.Context(), code, *userID)

	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLNotFound):
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *URLHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	code := r.PathValue("code")

	userID := userIDFromContext(r.Context())

	if userID == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	url, err := h.serv.GetStats(r.Context(), code, *userID)

	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLNotFound):
			w.WriteHeader(http.StatusNotFound)
		case errors.Is(err, domain.ErrURLForbidden):
			w.WriteHeader(http.StatusForbidden)
		default:
			w.WriteHeader(http.StatusInternalServerError)
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
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)

}

func (h *URLHandler) GetUserURLs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := userIDFromContext(r.Context())
	if userID == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	urls, err := h.serv.GetUserURLs(r.Context(), *userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
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

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
