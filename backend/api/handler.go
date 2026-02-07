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

type APIError struct {
	Error   string            `json:"error"`             

	Code    string            `json:"code"`              

	Details map[string]string `json:"details,omitempty"` 

}

const (
	ErrCodeValidation     = "VALIDATION_ERROR"
	ErrCodeNotFound       = "NOT_FOUND"
	ErrCodeMethodNotAllow = "METHOD_NOT_ALLOWED"
	ErrCodeTimeout        = "TIMEOUT"
	ErrCodeInternal       = "INTERNAL_ERROR"
)

type SuccessResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type PackageActionResponse struct {
	Status  string `json:"status"`
	Package string `json:"package"`
	Action  string `json:"action,omitempty"`
}

type ServiceActionResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Action  string `json:"action"`
}

type SystemOperationResponse struct {
	Message string `json:"message"`
	Output  string `json:"output"`
}

type UsageResponse struct {
	Usage string `json:"usage"`
}

type Handler struct {
	brew           *brew.ServiceManager
	requestTimeout time.Duration
}

func NewHandler(b *brew.ServiceManager) *Handler {
	return &Handler{
		brew:           b,
		requestTimeout: 5 * time.Minute, 

	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("ERROR: Failed to encode JSON response: %v", err)

	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, APIError{
		Error: message,
		Code:  code,
	})
}

func writeErrorWithDetails(w http.ResponseWriter, status int, code, message string, details map[string]string) {
	writeJSON(w, status, APIError{
		Error:   message,
		Code:    code,
		Details: details,
	})
}

func handleBrewError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}

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

		log.Printf("Brew command error: %v", commandErr)

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

func (h *Handler) UpgradePackage(w http.ResponseWriter, r *http.Request) {
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
		action = "pin" 

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

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second) 

	defer cancel()

	usage, err := h.brew.GetPackageUsage(ctx, name)
	if err != nil {
		handleBrewError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, UsageResponse{Usage: usage})
}

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

	if results == nil {
		results = []string{}
	}

	writeJSON(w, http.StatusOK, results)
}

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

func (h *Handler) InstallPackage(w http.ResponseWriter, r *http.Request) {
	if !checkMethod(w, r, http.MethodPost, http.MethodOptions) {
		return
	}
	if r.Method == http.MethodOptions {
		return
	}

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

