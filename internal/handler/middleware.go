package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const contextKeyUserID contextKey = "userID"
const contextKeyLogger contextKey = "logger"

type CustomClaims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

func userIDFromContext(ctx context.Context) *int64 {
	val, ok := ctx.Value(contextKeyUserID).(int64)

	if !ok {
		return nil
	}
	return &val
}

func AuthMiddleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				next.ServeHTTP(w, r)
				return
			}
			parts := strings.SplitN(authHeader, " ", 2)

			if len(parts) != 2 || parts[0] != "Bearer" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				return
			}

			var claims CustomClaims

			token, err := jwt.ParseWithClaims(parts[1], &claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("Unexpected signing method: %v", t.Header["al6g"])
				}
				return secret, nil
			})
			if err != nil || !token.Valid {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				return
			}

			ctx :=context.WithValue(r.Context(),contextKeyUserID,claims.UserID)
			next.ServeHTTP(w,r.WithContext(ctx))
		})
	}
}


func RequireAuth(next http.Handler)http.Handler{
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		userID := userIDFromContext(r.Context())

		if userID==nil{
			w.Header().Set("Content-Type","application/json")
			w.WriteHeader(http.StatusUnauthorized)
			return 
		}
		next.ServeHTTP(w,r)
	})
}