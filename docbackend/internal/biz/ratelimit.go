package biz

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ipBucket holds a per-IP token bucket for short-window (per-minute) throttling.
// Per-day caps are enforced by counting DB rows in the usecase, since an
// in-memory counter would reset whenever the process restarts and let abusers
// double-dip across restarts.
type ipBucket struct {
	limiter  *rate.Limiter
	lastUsed time.Time
}

// IPLimiter is a goroutine-safe per-IP token-bucket pool. Idle entries are
// pruned by a janitor so a long-running server doesn't accumulate memory
// proportional to every IP that ever hit it.
type IPLimiter struct {
	perMinute int

	mu      sync.Mutex
	buckets map[string]*ipBucket

	janitorOnce sync.Once
	stopCh      chan struct{}
}

func NewIPLimiter(perMinute int) *IPLimiter {
	if perMinute < 1 {
		perMinute = 1
	}
	return &IPLimiter{
		perMinute: perMinute,
		buckets:   make(map[string]*ipBucket),
		stopCh:    make(chan struct{}),
	}
}

// Allow returns true if the IP may proceed under the per-minute budget.
func (l *IPLimiter) Allow(ipHash string) bool {
	l.janitorOnce.Do(l.startJanitor)

	l.mu.Lock()
	b, ok := l.buckets[ipHash]
	if !ok {
		// Bucket size = perMinute; refill = perMinute per 60s.
		b = &ipBucket{
			limiter: rate.NewLimiter(rate.Limit(float64(l.perMinute)/60.0), l.perMinute),
		}
		l.buckets[ipHash] = b
	}
	b.lastUsed = time.Now()
	l.mu.Unlock()

	return b.limiter.Allow()
}

func (l *IPLimiter) startJanitor() {
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-l.stopCh:
				return
			case now := <-ticker.C:
				cutoff := now.Add(-30 * time.Minute)
				l.mu.Lock()
				for k, b := range l.buckets {
					if b.lastUsed.Before(cutoff) {
						delete(l.buckets, k)
					}
				}
				l.mu.Unlock()
			}
		}
	}()
}

func (l *IPLimiter) Close() { close(l.stopCh) }
