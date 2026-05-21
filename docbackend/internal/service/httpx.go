package service

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/7as0nch/mimo2codex/docbackend/internal/biz"
)

// writeJSON serializes v with 200 OK and Content-Type. The error from Encode
// is intentionally swallowed — once headers are flushed there's nothing
// recoverable to do, and the access log will surface broken connections.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError maps biz sentinel errors to HTTP status codes and a uniform body.
// Anything that isn't a recognized sentinel becomes 500 — that's intentional,
// so we don't accidentally leak unwrapped internals as 4xx.
func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, biz.ErrValidation):
		status = http.StatusBadRequest
	case errors.Is(err, biz.ErrRateLimit):
		status = http.StatusTooManyRequests
	case errors.Is(err, biz.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, biz.ErrForbidden):
		status = http.StatusForbidden
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

// decodeJSON wraps json.NewDecoder.Decode with a body-size cap so a malicious
// caller can't OOM us by streaming gigabytes into a "{title: ..." parse.
func decodeJSON(r *http.Request, dst any, maxBytes int64) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
