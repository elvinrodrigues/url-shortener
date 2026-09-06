package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/handler"
	"github.com/golang-jwt/jwt/v5"
)

func main() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default-secret-change-me"
	}
	claims := handler.CustomClaims{
		UserID:    1,
		Email:     "developer@elvin.dev",
		Name:      "Elvin Rodrigues",
		AvatarURL: "",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(10 * 365 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	// 1. Create token object with HS256 algorithm and claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// 2. Sign token with secret key
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		log.Fatalf("Failed to sign token: %v", err)
	}

	// 3. Print token string to terminal
	fmt.Println(tokenString)
}
