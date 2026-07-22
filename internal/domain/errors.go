package domain

import "errors"

var (
	ErrURLNotFound       = errors.New("url: not found")
	ErrURLDuplicate      = errors.New("url: duplicate short code")
	ErrURLDeleted        = errors.New("url: deleted")
	ErrURLExpired        = errors.New("url: link had expired")
	ErrURLInvalid        = errors.New("url: invalid")
	ErrURLForbidden      = errors.New("url: forbidden")
	ErrURLShortenFailed  = errors.New("url: short code generation failed")
	ErrCustomCodeInvalid = errors.New("url: invalid custom code")
	ErrCacheMiss         = errors.New("cache: miss")
	ErrNotImplemented    = errors.New("not implemented")
)
