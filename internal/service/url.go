package service

import (
	"context"
	"errors"
	"log"
	"net/url"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/shortcode"
)

type urlService struct {
	repo domain.URLRepository
}

func New(r domain.URLRepository) domain.URLService {
	return &urlService{repo: r}
}

func (s *urlService) Shorten(ctx context.Context, req domain.CreateURLRequest) (*domain.URL, error) {
	if err := validateURL(req.LongURL); err != nil {
		return nil, err
	}
	const maxRetries = 5
	codeLen := 7

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 2 {
			codeLen = 8
		}
		code, err := shortcode.Generate(codeLen)
		if err != nil {
			return nil, err
		}

		url, err := s.repo.Create(ctx, &req, code)
		if err != nil {
			if !errors.Is(err, domain.ErrURLDuplicate) {
				return nil, err
			}
			log.Printf("short code collision, retrying: attempt=%d code_len=%d", attempt, codeLen)
		} else {
			return url, nil
		}
	}
	return nil, domain.ErrURLShortenFailed
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

func validateURL(longURL string) error {
	if longURL == "" {
		return domain.ErrURLInvalid
	}
	u, err := url.Parse(longURL)

	if err != nil || !(u.Scheme == "http" || u.Scheme == "https") || u.Host == "" {
		return domain.ErrURLInvalid
	}
	return nil
}
