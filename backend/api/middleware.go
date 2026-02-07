/*
Package api provides HTTP middleware for the Homebrew Manager API.

This file contains middleware components that handle cross-cutting concerns:
- CORS (Cross-Origin Resource Sharing)
- Request logging
- Panic recovery

Middleware Design:
All middleware follows the standard Go pattern of wrapping http.Handler.
They are designed to be composable and can be chained in any order,
though the recommended order is: Recovery → Logging → CORS → Handler.

Usage:

	handler := api.NewHandler(brewSvc)
	mux := http.NewServeMux()
	// ... register handlers

	// Wrap with middleware chain
	wrapped := api.RecoveryMiddleware(
		api.LoggingMiddleware(
			api.CORSMiddleware(mux, api.DefaultCORSConfig()),
		),
	)

	http.ListenAndServe(":8080", wrapped)
*/
package api

import (
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

// =============================================================================
// CORS Middleware
// =============================================================================

// CORSConfig holds configuration for CORS middleware.
type CORSConfig struct {
	// AllowedOrigins is a list of origins that are allowed to make cross-origin
	// requests. Use "*" to allow all origins (not recommended for production).
	AllowedOrigins []string

	// AllowedMethods is a list of HTTP methods allowed for cross-origin requests.
	AllowedMethods []string

	// AllowedHeaders is a list of headers that are allowed in requests.
	AllowedHeaders []string

	// AllowCredentials indicates whether the browser should include credentials.
	AllowCredentials bool

	// MaxAge is how long (in seconds) the preflight response can be cached.
	MaxAge int
}

// DefaultCORSConfig returns a CORS configuration suitable for development.
//
// WARNING: This allows all origins (*). For production, specify exact origins.
func DefaultCORSConfig() CORSConfig {
	return CORSConfig{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization", "X-Request-ID"},
		MaxAge:         86400, // 24 hours
	}
}

// ProductionCORSConfig returns a CORS configuration for production use.
//
// Parameters:
// - origins: List of allowed origins (e.g., "https://example.com")
func ProductionCORSConfig(origins ...string) CORSConfig {
	cfg := DefaultCORSConfig()
	cfg.AllowedOrigins = origins
	cfg.AllowCredentials = true
	return cfg
}

// CORSMiddleware returns middleware that handles CORS headers.
//
// For preflight (OPTIONS) requests, it responds with appropriate headers
// and a 204 No Content status. For actual requests, it adds CORS headers
// to the response.
//
// Security Note:
// CORS is a browser security mechanism. It does NOT prevent server-side
// access to your API. Always implement proper authentication/authorization.
func CORSMiddleware(next http.Handler, cfg CORSConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Check if origin is allowed
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

		// Handle preflight requests
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

// =============================================================================
// Logging Middleware
// =============================================================================

// responseWriter wraps http.ResponseWriter to capture status code.
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

// LoggingMiddleware logs HTTP requests with timing information.
//
// Log Format:
//
//	"METHOD /path" status_code duration_ms
//
// Example:
//
//	"GET /api/packages" 200 45ms
//
// For errors (status >= 400), the log level is elevated.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := wrapResponseWriter(w)
		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)

		// Log with appropriate level based on status
		if wrapped.status >= 500 {
			log.Printf("ERROR: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		} else if wrapped.status >= 400 {
			log.Printf("WARN: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		} else {
			log.Printf("INFO: %s %s %d %v", r.Method, r.URL.Path, wrapped.status, duration)
		}
	})
}

// =============================================================================
// Recovery Middleware
// =============================================================================

// RecoveryMiddleware recovers from panics and returns a 500 error.
//
// This middleware should be at the outermost layer of the middleware chain
// to catch panics from any handler or inner middleware.
//
// Behavior:
// - Catches panics and logs the stack trace
// - Returns a 500 Internal Server Error to the client
// - Does NOT expose panic details to the client (security)
//
// Note: This is a last-resort handler. Proper error handling should
// prevent panics from occurring in the first place.
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Log the panic with stack trace
				log.Printf("PANIC: %v\n%s", err, debug.Stack())

				// Return generic error to client
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(`{"error":"Internal server error","code":"INTERNAL_ERROR"}`))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

// =============================================================================
// Middleware Chain Helper
// =============================================================================

// ChainMiddleware applies middleware in order (last applied = first executed).
//
// Usage:
//
//	handler := ChainMiddleware(
//		myHandler,
//		CORSMiddlewareFunc(cfg),
//		LoggingMiddleware,
//		RecoveryMiddleware,
//	)
//
// This produces: Recovery(Logging(CORS(handler)))
func ChainMiddleware(handler http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}

// CORSMiddlewareFunc returns a middleware function for use with ChainMiddleware.
func CORSMiddlewareFunc(cfg CORSConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return CORSMiddleware(next, cfg)
	}
}
