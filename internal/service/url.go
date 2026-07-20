package service

import (
	"context"
	"log"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
)

type urlService struct {
	repo domain.URLRepository
}

func New(r domain.URLRepository) domain.URLService {
	return &urlService{repo: r}
}

func (s *urlService) Shorten(ctx context.Context, req domain.CreateURLRequest) (*domain.URL, error) {
	// TODO: generate short code (Base62 or CustomCode validation) — Day 2/3
	return nil, domain.ErrNotImplemented
}

func (s *urlService) Redirect(ctx context.Context, code string) (string, error) {
	url, err := s.repo.GetByCode(ctx, code)

	if err != nil {
		return "", err
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := s.repo.IncrementClicks(ctx, url.ShortCode); err != nil {
			log.Println("Error", err)
		}
	}()

	return url.LongURL, nil
}
func (s *urlService) Delete(ctx context.Context, code string, userID int64) error {
	err := s.repo.Deactivate(ctx, code, userID)

	if err != nil {
		return err
	}

	return nil
}
func (s *urlService) GetStats(ctx context.Context, code string) (*domain.URL, error) {
	url, err := s.repo.GetStats(ctx, code)

	if err != nil {
		return nil, err
	}

	return url, nil
}
