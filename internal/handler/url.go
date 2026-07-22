package handler

import (
	"encoding/json"
	"errors"
	"net/http"

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
	url, err := h.serv.Shorten(r.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrURLDuplicate):
			w.WriteHeader(http.StatusConflict)
		case errors.Is(err, domain.ErrURLInvalid):
			w.WriteHeader(http.StatusUnprocessableEntity)
		case errors.Is(err, domain.ErrCustomCodeInvalid):
			w.WriteHeader(http.StatusUnprocessableEntity)
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

	longURl, err := h.serv.Redirect(r.Context(), code)

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
	http.Redirect(w, r, longURl, http.StatusFound)
}
