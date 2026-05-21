package biz

import "errors"

// Sentinel errors mapped to HTTP status codes by the service layer.
var (
	ErrValidation = errors.New("validation failed")
	ErrRateLimit  = errors.New("rate limit exceeded")
	ErrNotFound   = errors.New("not found")
	ErrForbidden  = errors.New("forbidden")
	ErrInternal   = errors.New("internal error")
)
