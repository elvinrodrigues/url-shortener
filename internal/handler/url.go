package handler

import (
	"encoding/json"
	"net/http"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
)

type URLHandler struct {
	serv domain.URLService
}

func New(s domain.URLService) *URLHandler {
	return &URLHandler{serv: s}
}

func (h *URLHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (h *URLHandler) Shorten(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req = domain.CreateURLRequest{}
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	url, err := h.serv.Shorten(r.Context(), req)
	if err != nil {
		w.WriteHeader(http.StatusNotImplemented)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(url)

}
