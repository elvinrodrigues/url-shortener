package ctxlog

import (
	"context"
	"log/slog"
)

type contextKey string

const KeyLogger contextKey = "logger"

func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, KeyLogger, logger)
}

func GetLogger(ctx context.Context, fallback *slog.Logger) *slog.Logger {
	if l, ok := ctx.Value(KeyLogger).(*slog.Logger); ok {
		return l
	}
	return fallback
}
