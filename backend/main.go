/*
Homebrew Manager - Backend Server

A REST API server for managing Homebrew packages and services through a web interface.

Architecture Overview:

	┌──────────────────────────────────────────────────────────────────────────┐
	│                            Frontend (React)                              │
	│                         http://localhost:5173                            │
	└─────────────────────────────────┬────────────────────────────────────────┘
	                                  │ HTTP/JSON
	┌─────────────────────────────────▼────────────────────────────────────────┐
	│                          Backend Server (Go)                             │
	│                         http://localhost:8080                            │
	│  ┌───────────────────────────────────────────────────────────────────┐   │
	│  │                      Middleware Stack                             │   │
	│  │   Recovery → Logging → CORS                                       │   │
	│  └───────────────────────────────────────────────────────────────────┘   │
	│  ┌───────────────────────────────────────────────────────────────────┐   │
	│  │                         API Handlers                              │   │
	│  │   /api/packages, /api/services, /api/system                       │   │
	│  └───────────────────────────────────────────────────────────────────┘   │
	│  ┌───────────────────────────────────────────────────────────────────┐   │
	│  │                      brew.ServiceManager                          │   │
	│  │   Executes Homebrew CLI commands with timeout/validation          │   │
	│  └───────────────────────────────────────────────────────────────────┘   │
	└─────────────────────────────────┬────────────────────────────────────────┘
	                                  │ exec
	┌─────────────────────────────────▼────────────────────────────────────────┐
	│                          Homebrew CLI                                    │
	│                   brew info, brew upgrade, brew services                 │
	└──────────────────────────────────────────────────────────────────────────┘

API Endpoints:

	Package Management:
	  GET    /api/packages              List all installed packages
	  POST   /api/packages/upgrade      Upgrade a package
	  DELETE /api/packages/uninstall    Uninstall a package
	  POST   /api/packages/reinstall    Reinstall a package
	  POST   /api/packages/pin          Pin/unpin a package
	  GET    /api/packages/usage        Get usage examples
	  GET    /api/packages/search       Search for packages

	Service Management:
	  GET    /api/services              List all services
	  POST   /api/services/control      Start/stop/restart a service

	System Operations:
	  POST   /api/system/update         Run brew update
	  POST   /api/system/cleanup        Run brew cleanup

Configuration:

	Environment Variables:
	  PORT           Server port (default: 8080)
	  CORS_ORIGINS   Comma-separated allowed origins (default: *)

Usage:

	go run main.go

The server implements graceful shutdown on SIGINT/SIGTERM, allowing
in-flight requests to complete before exiting.
*/
package main

import (
	"brew-manager/api"
	"brew-manager/brew"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// Default configuration values
const (
	defaultPort        = "8080"
	defaultCORSOrigins = "*"
	shutdownTimeout    = 30 * time.Second
	serverReadTimeout  = 30 * time.Second
	serverWriteTimeout = 10 * time.Minute // Long for upgrades
	serverIdleTimeout  = 120 * time.Second
)

func main() {
	// Load configuration from environment
	port := getEnv("PORT", defaultPort)
	corsOrigins := parseOrigins(getEnv("CORS_ORIGINS", defaultCORSOrigins))

	// Initialize services
	brewSvc := brew.NewService(brew.DefaultConfig())
	handler := api.NewHandler(brewSvc)

	// Setup routes
	mux := http.NewServeMux()
	registerRoutes(mux, handler)

	// Apply middleware chain
	corsConfig := api.CORSConfig{
		AllowedOrigins: corsOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
		MaxAge:         86400,
	}

	wrappedHandler := api.ChainMiddleware(
		mux,
		api.CORSMiddlewareFunc(corsConfig),
		api.LoggingMiddleware,
		api.RecoveryMiddleware,
	)

	// Configure server with timeouts
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      wrappedHandler,
		ReadTimeout:  serverReadTimeout,
		WriteTimeout: serverWriteTimeout,
		IdleTimeout:  serverIdleTimeout,
	}

	// Start server in background
	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("INFO: Starting backend server on http://localhost:%s", port)
		log.Printf("INFO: CORS origins: %v", corsOrigins)
		serverErrors <- server.ListenAndServe()
	}()

	// Wait for shutdown signal
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("FATAL: Server error: %v", err)
		}
	case sig := <-shutdown:
		log.Printf("INFO: Shutdown signal received: %v", sig)

		// Create shutdown context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()

		// Graceful shutdown
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("ERROR: Graceful shutdown failed: %v", err)
			// Force close
			server.Close()
		}

		log.Printf("INFO: Server shutdown complete")
	}
}

// registerRoutes sets up all API routes on the given mux.
func registerRoutes(mux *http.ServeMux, h *api.Handler) {
	// Package endpoints
	mux.HandleFunc("/api/packages", h.ListPackages)
	mux.HandleFunc("/api/packages/upgrade", h.UpgradePackage)
	mux.HandleFunc("/api/packages/uninstall", h.UninstallPackage)
	mux.HandleFunc("/api/packages/reinstall", h.ReinstallPackage)
	mux.HandleFunc("/api/packages/pin", h.PinPackage)
	mux.HandleFunc("/api/packages/usage", h.GetPackageUsage)
	mux.HandleFunc("/api/packages/search", h.SearchPackages)
	mux.HandleFunc("/api/packages/install", h.InstallPackage)

	// Dynamic package action routes (for /api/packages/:name/:action pattern)
	mux.HandleFunc("/api/packages/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/packages/")
		parts := strings.Split(path, "/")

		if len(parts) >= 2 {
			name := parts[0]
			action := parts[1]

			// Set the name in query params for handlers
			q := r.URL.Query()
			q.Set("name", name)
			r.URL.RawQuery = q.Encode()

			switch action {
			case "upgrade":
				h.UpgradePackage(w, r)
			case "uninstall":
				h.UninstallPackage(w, r)
			case "reinstall":
				h.ReinstallPackage(w, r)
			case "install":
				h.InstallPackage(w, r)
			case "pin":
				h.PinPackage(w, r)
			default:
				http.NotFound(w, r)
			}
			return
		}
		http.NotFound(w, r)
	})

	// Service endpoints
	mux.HandleFunc("/api/services", h.ListServices)
	mux.HandleFunc("/api/services/control", h.ControlService)

	// System endpoints
	mux.HandleFunc("/api/update", h.HandleSystemUpdate)
	mux.HandleFunc("/api/cleanup", h.HandleSystemCleanup)
	mux.HandleFunc("/api/doctor", h.HandleDoctor)

	// Backward compatible routes
	mux.HandleFunc("/api/system/update", h.HandleSystemUpdate)
	mux.HandleFunc("/api/system/cleanup", h.HandleSystemCleanup)
}

// getEnv returns an environment variable value or a default.
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// parseOrigins splits a comma-separated origin string.
func parseOrigins(s string) []string {
	if s == "" {
		return []string{}
	}

	parts := strings.Split(s, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}
