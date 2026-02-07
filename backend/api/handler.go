/*
Package api provides the HTTP API layer for the Homebrew Manager application.

Architecture Overview:

	┌─────────────────────────────────────────────────────────────────┐
	│                        HTTP Request                             │
	└─────────────────────────────┬───────────────────────────────────┘
	                              │
	┌─────────────────────────────▼───────────────────────────────────┐
	│                    Middleware Chain                             │
	│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
	│  │   CORS      │→│   Logging   │→│  Recovery   │                │
	│  └─────────────┘ └─────────────┘ └─────────────┘                │
	└─────────────────────────────┬───────────────────────────────────┘
	                              │
	┌─────────────────────────────▼───────────────────────────────────┐
	│                        Handler                                  │
	│  Validates input → Calls brew.ServiceManager → Formats response │
	└─────────────────────────────┬───────────────────────────────────┘
	                              │
	┌─────────────────────────────▼───────────────────────────────────┐
	│                   JSON Response                                 │
	└─────────────────────────────────────────────────────────────────┘

Design Principles:

1. Separation of Concerns:
  - Handlers focus only on HTTP request/response mapping
  - Business logic resides in the brew package
  - Cross-cutting concerns (CORS, logging) are in middleware

2. Error Handling Strategy:
  - All errors are returned as structured JSON with appropriate HTTP status codes
  - Validation errors → 400 Bad Request
  - Not found errors → 404 Not Found
  - Internal errors → 500 Internal Server Error
  - Errors are logged server-side but sanitized for client responses

3. HTTP Method Enforcement:
  - Each handler explicitly checks for allowed HTTP methods
  - OPTIONS is handled by CORS middleware for preflight requests
  - Wrong methods return 405 Method Not Allowed

4. Security Considerations:
  - CORS is explicitly configured (not wildcard in production)
  - Input validation happens before any processing
  - Error messages don't leak internal implementation details

Response Format:

Success responses vary by endpoint but always set Content-Type: application/json.

Error responses follow a consistent structure:

	{
	    "error": "Human-readable error message",
	    "code": "ERROR_CODE",
	    "details": { ... } // Optional additional context
	}

Thread Safety:
All handlers are stateless and safe for concurrent use. The underlying
ServiceManager is also thread-safe.
*/
package api

import (
	"brew-manager/brew"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

// =============================================================================
// Response Types
// =============================================================================

// APIError represents a structured error response.
// All error responses from this API follow this format.
type APIError struct {
	Error   string            `json:"error"`             // Human-readable message
	Code    string            `json:"code"`              // Machine-readable error code
	Details map[string]string `json:"details,omitempty"` // Additional context
}

// Common error codes for client handling
const (
	ErrCodeValidation     = "VALIDATION_ERROR"
	ErrCodeNotFound       = "NOT_FOUND"
	ErrCodeMethodNotAllow = "METHOD_NOT_ALLOWED"
	ErrCodeTimeout        = "TIMEOUT"
	ErrCodeInternal       = "INTERNAL_ERROR"
)

// SuccessResponse is used for mutating operations that don't return data.
type SuccessResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// PackageActionResponse is returned after package operations.
type PackageActionResponse struct {
	Status  string `json:"status"`
	Package string `json:"package"`
	Action  string `json:"action,omitempty"`
}

// ServiceActionResponse is returned after service operations.
type ServiceActionResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Action  string `json:"action"`
}

// SystemOperationResponse is returned after system-wide operations.
type SystemOperationResponse struct {
	Message string `json:"message"`
	Output  string `json:"output"`
}

// UsageResponse is returned from the package usage endpoint.
type UsageResponse struct {
	Usage string `json:"usage"`
}

// =============================================================================
// Handler
// =============================================================================

// Handler provides HTTP handlers for the Homebrew Manager API.
//
// Each handler method corresponds to one or more API endpoints. Handlers are
// responsible for:
// - Validating HTTP method
// - Extracting and validating request parameters
// - Calling the brew.ServiceManager for business logic
// - Formatting and writing the response
//
// Handler is stateless and safe for concurrent use from multiple goroutines.
type Handler struct {
	brew           *brew.ServiceManager
	requestTimeout time.Duration
}

// NewHandler creates a new API handler with the given service manager.
//
// Parameters:
// - b: A configured brew.ServiceManager instance
//
// The returned Handler is ready for immediate use and is thread-safe.
func NewHandler(b *brew.ServiceManager) *Handler {
	return &Handler{
		brew:           b,
		requestTimeout: 5 * time.Minute, // Allow long operations like upgrade
	}
}

// =============================================================================
// Response Helpers
// =============================================================================

// writeJSON writes a JSON response with the given status code.
// Handles JSON encoding errors gracefully by falling back to error response.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("ERROR: Failed to encode JSON response: %v", err)
		// At this point headers are already sent, we can only log
	}
}

// writeError writes a structured error response.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, APIError{
		Error: message,
		Code:  code,
	})
}

// writeErrorWithDetails writes a structured error response with additional context.
func writeErrorWithDetails(w http.ResponseWriter, status int, code, message string, details map[string]string) {
	writeJSON(w, status, APIError{
		Error:   message,
		Code:    code,
		Details: details,
	})
}

// handleBrewError converts brew package errors to appropriate HTTP responses.
// This centralizes error handling logic for consistent client experience.
func handleBrewError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}

	// Check for specific error types and return appropriate status codes
	var validationErr *brew.ValidationError
	var timeoutErr *brew.TimeoutError
	var commandErr *brew.CommandError

	switch {
	case errors.As(err, &validationErr):
		writeErrorWithDetails(w, http.StatusBadRequest, ErrCodeValidation,
			validationErr.Message,
			map[string]string{"field": validationErr.Field},
		)
	case errors.As(err, &timeoutErr):
		writeError(w, http.StatusGatewayTimeout, ErrCodeTimeout,
			"Operation timed out. The Homebrew command took too long to complete.",
		)
	case errors.As(err, &commandErr):
		// Log full error server-side
		log.Printf("Brew command error: %v", commandErr)
		// Return sanitized error to client
		writeError(w, http.StatusInternalServerError, ErrCodeInternal,
			"Homebrew command failed. Check server logs for details.",
		)
	default:
		log.Printf("Unexpected error: %v", err)
		writeError(w, http.StatusInternalServerError, ErrCodeInternal,
			"An unexpected error occurred.",
		)
	}
}

// checkMethod verifies the request uses an allowed HTTP method.
// Returns true if the method is allowed, false otherwise (response already written).
func checkMethod(w http.ResponseWriter, r *http.Request, allowed ...string) bool {
	for _, m := range allowed {
		if r.Method == m {
			return true
		}
	}

	w.Header().Set("Allow", strings.Join(allowed, ", "))
	writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllow,
		"Method "+r.Method+" not allowed. Use: "+strings.Join(allowed, ", "),
	)
	return false
}

// =============================================================================
// Package Handlers
// =============================================================================

// ListPackages handles GET /api/packages
//
// Returns a JSON array of all installed Homebrew packages (formulae and casks).
//
// Response: []brew.Package
//
// Errors:
// - 500: Failed to list packages
func (h *Handler) ListPackages(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodGet) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	pkgs, err := h.brew.ListInstalled(ctx)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, pkgs)
}

// UpgradePackage handles POST /api/packages/upgrade?name=<package>
//
// Upgrades a specific package to its latest version.
//
// Query Parameters:
// - name: Package name (required)
//
// Response: PackageActionResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Upgrade failed
// - 504: Upgrade timed out
func (h *Handler) UpgradePackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return // CORS preflight handled by middleware
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	if err := h.brew.UpgradePackage(ctx, name); err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, PackageActionResponse{
		Status:  "success",
		Package: name,
		Action:  "upgraded",
	})
}

// UninstallPackage handles DELETE /api/packages/uninstall?name=<package>
//
// Uninstalls a package from the system.
//
// Query Parameters:
// - name: Package name (required)
//
// Response: PackageActionResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Uninstall failed
func (h *Handler) UninstallPackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodDelete, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	if err := h.brew.UninstallPackage(ctx, name); err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, PackageActionResponse{
		Status:  "success",
		Package: name,
		Action:  "uninstalled",
	})
}

// ReinstallPackage handles POST /api/packages/reinstall?name=<package>
//
// Reinstalls a package (useful for repairing installations).
//
// Query Parameters:
// - name: Package name (required)
//
// Response: PackageActionResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Reinstall failed
func (h *Handler) ReinstallPackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	if err := h.brew.ReinstallPackage(ctx, name); err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, PackageActionResponse{
		Status:  "success",
		Package: name,
		Action:  "reinstalled",
	})
}

// PinPackage handles POST /api/packages/pin?name=<package>&action=<pin|unpin>
//
// Pins or unpins a package to prevent/allow automatic upgrades.
//
// Query Parameters:
// - name: Package name (required)
// - action: "pin" or "unpin" (optional, defaults to "pin")
//
// Response: PackageActionResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Pin/unpin operation failed
func (h *Handler) PinPackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}

	action := r.URL.Query().Get("action")
	if action == "" {
		action = "pin" // Default action
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	var err error
	if action == "unpin" {
		err = h.brew.UnpinPackage(ctx, name)
	} else {
		err = h.brew.PinPackage(ctx, name)
	}

	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, PackageActionResponse{
		Status:  "success",
		Package: name,
		Action:  action,
	})
}

// GetPackageUsage handles GET /api/packages/usage?name=<package>
//
// Returns usage examples for a package from cheat.sh or brew info.
//
// Query Parameters:
// - name: Package name (required)
//
// Response: UsageResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Failed to fetch usage info
func (h *Handler) GetPackageUsage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodGet, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second) // Shorter timeout for external API
	defer cancel()

	usage, err := h.brew.GetPackageUsage(ctx, name)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, UsageResponse{Usage: usage})
}

// SearchPackages handles GET /api/packages/search?q=<query>
//
// Searches for packages matching the query string.
//
// Query Parameters:
// - q: Search query (required, but empty returns empty array)
//
// Response: []string (package names)
//
// Errors:
// - 500: Search failed
func (h *Handler) SearchPackages(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodGet, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusOK, []string{})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	results, err := h.brew.Search(ctx, query)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	// Ensure we return an empty array, not null
	if results == nil {
		results = []string{}
	}

	writeJSON(w, http.StatusOK, results)
}

// =============================================================================
// Service Handlers
// =============================================================================

// ListServices handles GET /api/services
//
// Returns a JSON array of all Homebrew-managed services and their status.
//
// Response: []brew.Service
//
// Errors:
// - 500: Failed to list services
func (h *Handler) ListServices(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodGet) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	services, err := h.brew.ListServices(ctx)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, services)
}

// ControlService handles POST /api/services/control?name=<service>&action=<start|stop|restart>
//
// Controls a Homebrew-managed service.
//
// Query Parameters:
// - name: Service name (required)
// - action: One of "start", "stop", "restart" (required)
//
// Response: ServiceActionResponse
//
// Errors:
// - 400: Missing or invalid parameters
// - 500: Service control operation failed
func (h *Handler) ControlService(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	name := r.URL.Query().Get("name")
	action := r.URL.Query().Get("action")

	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'name' is required")
		return
	}
	if action == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Query parameter 'action' is required")
		return
	}

	// Validate action
	if action != "start" && action != "stop" && action != "restart" {
		writeErrorWithDetails(w, http.StatusBadRequest, ErrCodeValidation,
			"Invalid action. Must be one of: start, stop, restart",
			map[string]string{"action": action},
		)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	var err error
	switch action {
	case "start":
		err = h.brew.StartService(ctx, name)
	case "stop":
		err = h.brew.StopService(ctx, name)
	case "restart":
		err = h.brew.RestartService(ctx, name)
	}

	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, ServiceActionResponse{
		Status:  "success",
		Service: name,
		Action:  action,
	})
}

// =============================================================================
// System Handlers
// =============================================================================

// HandleSystemUpdate handles POST /api/system/update
//
// Runs 'brew update' to fetch latest package definitions.
//
// Response: SystemOperationResponse
//
// Errors:
// - 405: Method not allowed (must be POST)
// - 500: Update failed
// - 504: Update timed out
func (h *Handler) HandleSystemUpdate(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	output, err := h.brew.Update(ctx)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, SystemOperationResponse{
		Message: "Homebrew updated successfully",
		Output:  output,
	})
}

// HandleSystemCleanup handles POST /api/system/cleanup
//
// Runs 'brew cleanup' to remove old versions and clear caches.
//
// Response: SystemOperationResponse
//
// Errors:
// - 405: Method not allowed (must be POST)
// - 500: Cleanup failed
func (h *Handler) HandleSystemCleanup(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	output, err := h.brew.Cleanup(ctx)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, SystemOperationResponse{
		Message: "Cleanup completed successfully",
		Output:  output,
	})
}

// HandleDoctor handles POST /api/doctor
//
// Runs 'brew doctor' to check for issues with the Homebrew installation.
//
// Response: DoctorResponse with issues found
//
// Errors:
// - 405: Method not allowed (must be POST)
// - 500: Doctor command failed to execute
func (h *Handler) HandleDoctor(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	output, issues, err := h.brew.Doctor(ctx)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"output":    output,
		"issues":    issues,
		"isHealthy": len(issues) == 0,
	})
}

// InstallPackage handles POST /api/packages/{name}/install
//
// Installs a new package.
//
// Path Parameters:
// - name: Package name (required)
//
// Response: PackageActionResponse
//
// Errors:
// - 400: Missing or invalid package name
// - 500: Install failed
func (h *Handler) InstallPackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

	// Extract package name from URL path
	parts := strings.Split(r.URL.Path, "/")
	var name string
	for i, part := range parts {
		if part == "packages" && i+1 < len(parts) {
			name = parts[i+1]
			break
		}
	}

	if name == "" || name == "install" {
		name = r.URL.Query().Get("name")
	}

	if name == "" {
		writeError(w, http.StatusBadRequest, ErrCodeValidation, "Package name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	if err := h.brew.InstallPackage(ctx, name); err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, PackageActionResponse{
		Status:  "success",
		Package: name,
		Action:  "installed",
	})
}
