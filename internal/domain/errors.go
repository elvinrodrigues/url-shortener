package domain

import "errors"

var (
	ErrURLNotFound        = errors.New("url: not found")
	ErrURLDuplicate       = errors.New("url: duplicate short code")
	ErrURLExpired         = errors.New("url: expired")
	ErrURLInvalid         = errors.New("url: invalid")
	ErrURLForbidden       = errors.New("url: forbidden")
	ErrURLShortenFailed   = errors.New("url: short code generation failed")
	ErrCustomCodeInvalid  = errors.New("url: invalid custom code")
	ErrCacheMiss          = errors.New("cache: miss")
	ErrEmailConflict      = errors.New("user: email already linked to another account")
	ErrCustomCodeReserved = errors.New("url: custom code is reserved")
	ErrGoogleTokenInvalid = errors.New("auth: google token invalid")
)
