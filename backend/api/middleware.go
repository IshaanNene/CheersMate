package api

import (
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

type CORSConfig struct {

	AllowedOrigins []string

	AllowedMethods []string

	AllowedHeaders []string

	AllowCredentials bool

	MaxAge int
}

func DefaultCORSConfig() CORSConfig {
	return CORSConfig{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization", "X-Request-ID"},
		MaxAge:         86400, 

	}
}

func ProductionCORSConfig(origins ...string) CORSConfig {
	cfg := DefaultCORSConfig()
	cfg.AllowedOrigins = origins
	cfg.AllowCredentials = true
	return cfg
}

func CORSMiddleware(next http.Handler, cfg CORSConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		allowedOrigin := ""
		for _, o := range cfg.AllowedOrigins {
			if o == "*" {
				allowedOrigin = "*"
				break
			}
			if o == origin {
				allowedOrigin = origin
				break
			}
		}

		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			if cfg.AllowCredentials && allowedOrigin != "*" {
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", strings.Join(cfg.AllowedMethods, ", "))
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(cfg.AllowedHeaders, ", "))
			if cfg.MaxAge > 0 {
				w.Header().Set("Access-Control-Max-Age", string(rune(cfg.MaxAge)))
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func wrapResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, status: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.wroteHeader {
		rw.status = code
		rw.wroteHeader = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := wrapResponseWriter(w)
		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)

		if wrapped.status >= 500 {
			log.Printf("ERROR: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		} else if wrapped.status >= 400 {
			log.Printf("WARN: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		} else {
			log.Printf("INFO: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		}
	})
}

func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {

				log.Printf("PANIC: %v\n%s", err, debug.Stack())

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(`{"error":"Internal server error","code":"INTERNAL_ERROR"}`))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

func ChainMiddleware(handler http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}

func CORSMiddlewareFunc(cfg CORSConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return CORSMiddleware(next, cfg)
	}
}

