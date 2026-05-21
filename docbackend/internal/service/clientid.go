package service

import (
	"net/http"
	"strings"
)

// clientIDFrom prefers the value the browser stamps in the request body, then
// falls back to an X-Client-Id header (useful for SSE / fetch eventsource
// flows that can't easily ship JSON). Trims and caps length to keep DB rows
// well-shaped — anything past 64 chars is almost certainly noise.
func clientIDFrom(r *http.Request, fromBody string) string {
	id := strings.TrimSpace(fromBody)
	if id == "" {
		id = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}
	if len(id) > 64 {
		id = id[:64]
	}
	return id
}
