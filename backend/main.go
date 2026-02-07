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

const (
	defaultPort        = "8080"
	defaultCORSOrigins = "*"
	shutdownTimeout    = 30 * time.Second
	serverReadTimeout  = 30 * time.Second
	serverWriteTimeout = 10 * time.Minute 

	serverIdleTimeout  = 120 * time.Second
)

func main() {

	port := getEnv("PORT", defaultPort)
	corsOrigins := parseOrigins(getEnv("CORS_ORIGINS", defaultCORSOrigins))

	brewSvc := brew.NewService(brew.DefaultConfig())
	handler := api.NewHandler(brewSvc)

	mux := http.NewServeMux()
	registerRoutes(mux, handler)

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

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      wrappedHandler,
		ReadTimeout:  serverReadTimeout,
		WriteTimeout: serverWriteTimeout,
		IdleTimeout:  serverIdleTimeout,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("INFO: Starting backend server on http://localhost:%s", port)
		log.Printf("INFO: CORS origins: %v", corsOrigins)
		serverErrors <- server.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("FATAL: Server error: %v", err)
		}
	case sig := <-shutdown:
		log.Printf("INFO: Shutdown signal received: %v", sig)

		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("ERROR: Graceful shutdown failed: %v", err)

			server.Close()
		}

		log.Printf("INFO: Server shutdown complete")
	}
}

func registerRoutes(mux *http.ServeMux, h *api.Handler) {

	mux.HandleFunc("/api/packages", h.ListPackages)
	mux.HandleFunc("/api/packages/upgrade", h.UpgradePackage)
	mux.HandleFunc("/api/packages/uninstall", h.UninstallPackage)
	mux.HandleFunc("/api/packages/reinstall", h.ReinstallPackage)
	mux.HandleFunc("/api/packages/pin", h.PinPackage)
	mux.HandleFunc("/api/packages/usage", h.GetPackageUsage)
	mux.HandleFunc("/api/packages/search", h.SearchPackages)
	mux.HandleFunc("/api/packages/install", h.InstallPackage)

	mux.HandleFunc("/api/packages/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/packages/")
		parts := strings.Split(path, "/")

		if len(parts) >= 2 {
			name := parts[0]
			action := parts[1]

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

	mux.HandleFunc("/api/services", h.ListServices)
	mux.HandleFunc("/api/services/control", h.ControlService)

	mux.HandleFunc("/api/update", h.HandleSystemUpdate)
	mux.HandleFunc("/api/cleanup", h.HandleSystemCleanup)
	mux.HandleFunc("/api/doctor", h.HandleDoctor)

	mux.HandleFunc("/api/system/update", h.HandleSystemUpdate)
	mux.HandleFunc("/api/system/cleanup", h.HandleSystemCleanup)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

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

