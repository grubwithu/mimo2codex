package service

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"strings"
)

// IPHash returns sha256(ip + salt) so we can rate-limit and audit without
// retaining raw addresses. Honors the first hop in X-Forwarded-For when set
// (nginx in front of docbackend is the expected deploy shape — see plan
// §"部署形态"). If you ever deploy without a trusted proxy, drop the XFF
// branch so callers can't spoof their bucket.
func IPHash(r *http.Request, salt string) string {
	ip := remoteIP(r)
	sum := sha256.Sum256([]byte(ip + "|" + salt))
	return hex.EncodeToString(sum[:])
}

func remoteIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first entry, which is the original client.
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return strings.TrimSpace(xr)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
