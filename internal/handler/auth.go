package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) GoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req domain.GoogleAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		writeJSONError(w, http.StatusBadRequest, "id_token is required")
		return
	}

	res, err := h.authService.AuthenticateGoogle(r.Context(), req.IDToken)
	if err != nil {
		ctxlog.GetLogger(r.Context(), slog.Default()).Error("google auth failed", "error", err)
		switch {
		case errors.Is(err, domain.ErrGoogleTokenInvalid):
			msg := strings.TrimPrefix(err.Error(), domain.ErrGoogleTokenInvalid.Error()+": ")
			writeJSONError(w, http.StatusUnauthorized, msg)
		case errors.Is(err, domain.ErrEmailConflict):
			writeJSONError(w, http.StatusConflict, "Email already linked to another account")
		default:
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
