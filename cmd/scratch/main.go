package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"sync/atomic"

	"github.com/elvinrodrigues/url-shortener/internal/config"
	"github.com/elvinrodrigues/url-shortener/internal/db"
	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/repository/postgres"
	"github.com/elvinrodrigues/url-shortener/internal/service"
)

func main() {
	cfg, err := config.Load()

	if err != nil {
		log.Fatalf("Config error %v", err)
	}
	db, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection error %v", err)
	}
	repo := postgres.New(db)
	serv := service.New(repo)

	var wg sync.WaitGroup

	var successCount atomic.Int64
	var failCount atomic.Int64
	for range 100 {
		wg.Go(func() {
			var req domain.CreateURLRequest
			req.LongURL = "https://example.com"
			_, err := serv.Shorten(context.Background(), req)
			if err != nil {
				fmt.Println("Error ", err)
				failCount.Add(1)
			} else {
				successCount.Add(1)
			}
		})
	}
	wg.Wait()
	fmt.Println("Success Count", successCount.Load())
	fmt.Println("Failure count", failCount.Load())
}
