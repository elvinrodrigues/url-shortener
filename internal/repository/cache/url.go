package cache

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/redis/go-redis/v9"
)

type RedisURLCache struct {
	client *redis.Client
	ttl    time.Duration
}

func (c *RedisURLCache) Client() *redis.Client {
	return c.client
}

func NewRedisURLCache(addr string, defaultTTL time.Duration) (*RedisURLCache, error) {
	var opts *redis.Options
	if strings.HasPrefix(addr, "redis://") || strings.HasPrefix(addr, "rediss://") {
		var err error
		opts, err = redis.ParseURL(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid redis url %w", err)
		}
	} else {
		opts = &redis.Options{
			Addr:            addr,
			PoolSize:        10,
			MinIdleConns:    2,
			ConnMaxIdleTime: 5 * time.Minute,
		}
		if strings.Contains(addr, "upstash.io") {
			opts.TLSConfig = &tls.Config{
				MinVersion: tls.VersionTLS12,
			}
		}
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return &RedisURLCache{client: client, ttl: defaultTTL}, fmt.Errorf("redis ping %w", err)
	}
	return &RedisURLCache{client: client, ttl: defaultTTL}, nil
}

func (c *RedisURLCache) Get(ctx context.Context, code string) (string, error) {
	key := "url:" + code

	val, err := c.client.Get(ctx, key).Result()

	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", domain.ErrCacheMiss
		}
		return "", fmt.Errorf("cache get: %w", err)
	}
	return val, nil
}

func (c *RedisURLCache) Set(ctx context.Context, code, longURL string, ttl time.Duration) error {
	key := "url:" + code

	err := c.client.Set(ctx, key, longURL, ttl).Err()

	if err != nil {
		return fmt.Errorf("cache set: %w", err)
	}
	return nil
}

func (c *RedisURLCache) Delete(ctx context.Context, code string) error {
	key := "url:" + code

	err := c.client.Del(ctx, key).Err()

	if err != nil {
		return fmt.Errorf("cache delete: %w", err)
	}
	return nil
}
