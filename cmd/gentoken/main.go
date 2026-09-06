// Command gentoken mints a signed application JWT for local development and
// manual API testing. It is not part of the server binary and is never used at
// runtime.
//
// JWT_SECRET is required rather than defaulted: a built-in fallback secret would
// mint tokens that silently fail against every real server, and — worse — invite
// the fallback to be copied into a deployment. Token lifetime is a flag with a
// short default so a throwaway credential does not outlive the session it was
// made for.
//
//	JWT_SECRET=dev-secret go run ./cmd/gentoken -user 7 -ttl 1h
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/handler"
	"github.com/golang-jwt/jwt/v5"
)

func main() {
	userID := flag.Int64("user", 1, "user_id claim to embed in the token")
	email := flag.String("email", "developer@example.test", "email claim")
	name := flag.String("name", "Local Developer", "name claim")
	ttl := flag.Duration("ttl", 24*time.Hour, "how long the token stays valid")
	flag.Parse()

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET is required; export the same secret the server runs with")
	}
	if *ttl <= 0 {
		log.Fatalf("invalid -ttl %v: must be positive", *ttl)
	}

	now := time.Now()
	claims := handler.CustomClaims{
		UserID: *userID,
		Email:  *email,
		Name:   *name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(*ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	tokenString, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		log.Fatalf("failed to sign token: %v", err)
	}

	fmt.Println(tokenString)
}
