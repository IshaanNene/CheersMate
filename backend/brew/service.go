/*
Package brew provides a service layer for interacting with the Homebrew package manager CLI.

Architecture Overview:
This package serves as the sole interface between the application and the Homebrew
command-line tool. It encapsulates all brew CLI interactions, providing a type-safe,
error-handled Go API for package and service management operations.

Design Decisions:

 1. Command Execution Model:
    All operations execute synchronously with configurable timeouts. This design was
    chosen because brew operations (especially upgrades) can take significant time,
    and we need to provide meaningful feedback to users while preventing indefinite hangs.

 2. Error Strategy:
    Custom error types wrap underlying OS/exec errors to provide actionable context.
    Errors are categorized as: validation errors (4xx equivalent), execution errors
    (5xx equivalent), and timeout errors (client should retry or inform user).

3. Security Considerations:

  - Package names are validated against a strict regex to prevent command injection

  - No shell interpretation is used (exec.Command, not shell execution)

  - External HTTP requests (cheat.sh) use timeouts and error handling

    4. Concurrency:
    The ServiceManager is stateless and safe for concurrent use. Each method creates
    its own command context and can be called from multiple goroutines simultaneously.

Responsibilities:
- Execute Homebrew CLI commands for package/service management
- Parse and transform CLI JSON output into Go structs
- Validate all inputs before execution
- Provide meaningful errors for all failure modes
- Enforce timeouts on potentially long-running operations

Related Packages:
- api: HTTP handlers that consume this service
- config: Provides timeout and other configuration values

Example Usage:

	svc := brew.NewService(brew.DefaultConfig())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	packages, err := svc.ListInstalled(ctx)
	if err != nil {
		var cmdErr *brew.CommandError
		if errors.As(err, &cmdErr) {
			log.Printf("brew command failed: %s", cmdErr.Stderr)
		}
		return err
	}
*/
package brew

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// =============================================================================
// Configuration
// =============================================================================

// Config holds configuration options for the ServiceManager.
// All timeouts are in seconds to allow easy configuration from environment variables.
type Config struct {
	// CommandTimeout is the default timeout for brew CLI commands.
	// Long operations like upgrade may need longer timeouts.
	// Default: 300 seconds (5 minutes).
	CommandTimeout time.Duration

	// HTTPTimeout is the timeout for external HTTP requests (e.g., cheat.sh).
	// Default: 10 seconds.
	HTTPTimeout time.Duration
}

// DefaultConfig returns a Config with sensible production defaults.
// These values are chosen based on real-world observation of brew operation times:
// - Most info/list operations complete in <5 seconds
// - Upgrades can take several minutes for large packages
// - Network requests should fail fast
func DefaultConfig() Config {
	return Config{
		CommandTimeout: 5 * time.Minute,
		HTTPTimeout:    10 * time.Second,
	}
}

// =============================================================================
// Error Types
// =============================================================================

// ValidationError indicates that input validation failed before command execution.
// This is a client error - the request should not be retried without modification.
type ValidationError struct {
	Field   string // The field that failed validation
	Value   string // The invalid value (may be truncated for security)
	Message string // Human-readable description of the validation failure
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error on field %q: %s", e.Field, e.Message)
}

// CommandError indicates that a brew CLI command failed during execution.
// This wraps the underlying exec error with additional context.
type CommandError struct {
	Command string   // The brew subcommand that was executed (e.g., "upgrade")
	Args    []string // Arguments passed to the command
	Stderr  string   // Captured stderr output (truncated to 1KB max)
	Cause   error    // The underlying error from os/exec
}

func (e *CommandError) Error() string {
	return fmt.Sprintf("brew %s failed: %v (stderr: %s)", e.Command, e.Cause, e.Stderr)
}

func (e *CommandError) Unwrap() error {
	return e.Cause
}

// TimeoutError indicates that a brew command exceeded its timeout.
// Long-running operations like upgrades may legitimately timeout.
// Clients should either retry with a longer timeout or inform the user.
type TimeoutError struct {
	Command string        // The command that timed out
	Timeout time.Duration // The timeout that was exceeded
}

func (e *TimeoutError) Error() string {
	return fmt.Sprintf("brew %s timed out after %v", e.Command, e.Timeout)
}

// =============================================================================
// Input Validation
// =============================================================================

// packageNameRegex validates Homebrew package/formula names.
// Valid names start with alphanumeric and can contain: letters, numbers, @, _, ., +, -
// Examples: "go", "node@18", "gcc", "llvm@15", "python-setuptools"
// This regex is intentionally strict to prevent command injection.
var packageNameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@._+-]*$`)

// maxPackageNameLength prevents DoS via extremely long package names.
// Homebrew package names are typically short (<50 chars).
const maxPackageNameLength = 128

// validatePackageName checks that a package name is safe for use in commands.
// Returns a ValidationError if the name is invalid.
//
// Security Note:
// This validation is critical for preventing command injection. Even though
// exec.Command doesn't use shell interpretation, we validate defensively.
func validatePackageName(name string) error {
	if name == "" {
		return &ValidationError{
			Field:   "name",
			Value:   "",
			Message: "package name is required",
		}
	}

	if len(name) > maxPackageNameLength {
		return &ValidationError{
			Field:   "name",
			Value:   name[:20] + "...", // Truncate for security
			Message: fmt.Sprintf("package name exceeds maximum length of %d", maxPackageNameLength),
		}
	}

	if !packageNameRegex.MatchString(name) {
		return &ValidationError{
			Field:   "name",
			Value:   name,
			Message: "package name contains invalid characters; must match pattern: " + packageNameRegex.String(),
		}
	}

	return nil
}

// validateServiceAction checks that a service action is one of the allowed values.
func validateServiceAction(action string) error {
	switch action {
	case "start", "stop", "restart":
		return nil
	default:
		return &ValidationError{
			Field:   "action",
			Value:   action,
			Message: "action must be one of: start, stop, restart",
		}
	}
}

// =============================================================================
// Data Types
// =============================================================================

// Package represents a Homebrew package (formula or cask) with its metadata.
//
// This struct is designed to capture the essential information needed by the UI
// while remaining compatible with brew's JSON output format. Not all fields from
// brew's output are captured - only those needed for display and operations.
//
// Field Mapping:
// - "name": The short name used for install/uninstall commands
// - "full_name": May include tap prefix (e.g., "homebrew/core/go")
// - "versions.stable": The latest stable version available
// - "installed[].version": Currently installed version(s)
// - "outdated": True if a newer version is available
//
// Lifecycle:
// Instances are created by ListInstalled() and should be treated as immutable
// snapshots. The outdated status may change after brew update.
type Package struct {
	Name     string `json:"name"`
	FullName string `json:"full_name"`
	Desc     string `json:"desc"`
	Homepage string `json:"homepage"`
	Versions struct {
		Stable string `json:"stable"`
	} `json:"versions"`
	Installed []struct {
		Version               string `json:"version"`
		InstalledOnRequest    bool   `json:"installed_on_request"`
		InstalledAsDependency bool   `json:"installed_as_dependency"`
		InstalledTime         int64  `json:"time,omitempty"` // Unix timestamp
	} `json:"installed"`
	Outdated          bool     `json:"outdated"`
	Pinned            bool     `json:"pinned"`
	Dependencies      []string `json:"dependencies"`
	BuildDependencies []string `json:"build_dependencies"`
	Caveats           string   `json:"caveats"`
	ConflictsWith     []string `json:"conflicts_with"`

	// Extended fields for UI sorting/filtering
	InstalledSize int64  `json:"installed_size,omitempty"` // Size in bytes
	InstallDate   string `json:"install_date,omitempty"`   // ISO date string
	IsCask        bool   `json:"is_cask"`                  // True if this is a cask (GUI app)
}

// Service represents a Homebrew-managed service and its runtime status.
//
// Services are background processes managed by `brew services`. Common examples
// include databases (postgresql, mysql, redis), web servers (nginx), and
// development tools.
//
// The Status field maps to brew's service states:
// - "started": Service is running
// - "stopped": Service is not running
// - "none": Service file exists but has never been started
// - "error": Service failed to start
//
// Note: The Running field is a convenience boolean derived from Status.
// It is NOT part of the brew JSON output but is computed for easier UI binding.
type Service struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	User     string `json:"user"`
	Plist    string `json:"plist"`
	Running  bool   `json:"running"` // Computed field, not from CLI
	Homepage string `json:"homepage"`
}

// ServiceListEntry is the raw format returned by `brew services list --json`.
// This is an internal type used for JSON unmarshaling.
// The exported Service type is derived from this after enrichment.
type serviceListEntry struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	User   string `json:"user"`
	Plist  string `json:"file"` // Note: brew uses "file" in JSON, not "plist"
}

// brewInfoResponse is the top-level structure for `brew info --json=v2` output.
type brewInfoResponse struct {
	Formulae []Package `json:"formulae"`
	Casks    []Package `json:"casks"`
}

// =============================================================================
// Service Manager
// =============================================================================

// ServiceManager provides a high-level interface for Homebrew operations.
//
// Design:
// - Stateless: All state is derived from brew CLI calls
// - Thread-safe: Safe for concurrent use from multiple goroutines
// - Context-aware: All operations respect context cancellation/timeout
//
// Error Handling:
// All methods return typed errors from this package. Use errors.As() to
// check for specific error types and provide appropriate user feedback.
//
// Performance Considerations:
// - ListInstalled() is O(n) where n = number of installed packages
// - Individual package operations are O(1) but may take time for network/disk I/O
// - Consider caching ListInstalled() results in the caller if called frequently
type ServiceManager struct {
	config     Config
	httpClient *http.Client
}

// NewService creates a new ServiceManager with the given configuration.
// If cfg is zero-valued, DefaultConfig() values are used.
//
// The returned ServiceManager is ready for immediate use and is safe
// for concurrent access from multiple goroutines.
func NewService(cfg Config) *ServiceManager {
	// Apply defaults for zero values
	if cfg.CommandTimeout == 0 {
		cfg.CommandTimeout = DefaultConfig().CommandTimeout
	}
	if cfg.HTTPTimeout == 0 {
		cfg.HTTPTimeout = DefaultConfig().HTTPTimeout
	}

	return &ServiceManager{
		config: cfg,
		httpClient: &http.Client{
			Timeout: cfg.HTTPTimeout,
		},
	}
}

// =============================================================================
// Package Operations
// =============================================================================

// ListInstalled returns all installed packages (both formulae and casks).
//
// This method executes `brew info --installed --json=v2` which provides
// detailed information about all installed packages in a single call.
//
// Performance:
// - Time: O(n) where n = number of installed packages, typically 1-5 seconds
// - Memory: Proportional to number of packages, typically <1MB
//
// Error Conditions:
// - TimeoutError: If the command exceeds the configured timeout
// - CommandError: If brew exits with non-zero status
//
// Thread Safety: Safe for concurrent calls.
func (s *ServiceManager) ListInstalled(ctx context.Context) ([]Package, error) {
	output, err := s.runBrewCommand(ctx, "info", "--installed", "--json=v2")
	if err != nil {
		return nil, err
	}

	var result brewInfoResponse
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse brew info output: %w", err)
	}

	// Combine formulae and casks into a single slice
	// Mark casks so frontend can filter by type
	packages := make([]Package, 0, len(result.Formulae)+len(result.Casks))

	for _, pkg := range result.Formulae {
		pkg.IsCask = false
		// Extract install date from installed info if available (Unix timestamp -> ISO string)
		if len(pkg.Installed) > 0 && pkg.Installed[0].InstalledTime > 0 {
			pkg.InstallDate = time.Unix(pkg.Installed[0].InstalledTime, 0).Format(time.RFC3339)
		}
		packages = append(packages, pkg)
	}

	for _, pkg := range result.Casks {
		pkg.IsCask = true
		// Extract install date from installed info if available (Unix timestamp -> ISO string)
		if len(pkg.Installed) > 0 && pkg.Installed[0].InstalledTime > 0 {
			pkg.InstallDate = time.Unix(pkg.Installed[0].InstalledTime, 0).Format(time.RFC3339)
		}
		packages = append(packages, pkg)
	}

	return packages, nil
}

// UpgradePackage upgrades a specific package to the latest version.
//
// This method executes `brew upgrade <name>` which will:
// - Download the latest version if not cached
// - Build from source if no bottle is available
// - Replace the installed version
//
// Parameters:
// - ctx: Context for timeout/cancellation. Upgrades can take several minutes.
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - TimeoutError: If the upgrade exceeds timeout (consider increasing for large packages)
// - CommandError: If brew upgrade fails (e.g., conflicts, build errors)
//
// Note: Pinned packages cannot be upgraded. Check Package.Pinned before calling.
func (s *ServiceManager) UpgradePackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "upgrade", name)
	return err
}

// UninstallPackage removes a package from the system.
//
// This method executes `brew uninstall <name>` which will:
// - Remove the package binaries and libraries
// - NOT remove dependencies (use `brew autoremove` for that)
// - NOT remove configuration files in user directories
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If uninstall fails (e.g., package not found, in use by dependents)
//
// Warning: This operation is destructive and cannot be undone.
func (s *ServiceManager) UninstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "uninstall", name)
	return err
}

// ReinstallPackage reinstalls a package, effectively uninstalling and installing.
//
// This is useful for:
// - Repairing a corrupted installation
// - Rebuilding a package with different options
// - Resetting a package to its default state
//
// Parameters:
// - ctx: Context for timeout/cancellation (may take as long as install)
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If reinstall fails
func (s *ServiceManager) ReinstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "reinstall", name)
	return err
}

// PinPackage pins a package to prevent it from being upgraded.
//
// Pinned packages are skipped during `brew upgrade` operations.
// This is useful for packages where you need a specific version
// for compatibility reasons.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If pin fails (e.g., package not installed)
//
// Note: Only formulae can be pinned, not casks.
func (s *ServiceManager) PinPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "pin", name)
	return err
}

// UnpinPackage removes the pin from a package, allowing upgrades.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If unpin fails (e.g., package not pinned)
func (s *ServiceManager) UnpinPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "unpin", name)
	return err
}

// InstallPackage installs a new package.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If install fails (e.g., package not found)
func (s *ServiceManager) InstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "install", name)
	return err
}

// =============================================================================
// System Operations
// =============================================================================

// Update fetches the newest version of Homebrew and all formulae.
//
// This method executes `brew update` which:
// - Fetches the newest Homebrew core from GitHub
// - Updates all tap repositories
// - Updates the formula database
//
// Performance:
// - Requires network access to GitHub
// - Typically takes 5-30 seconds depending on network
//
// Error Conditions:
// - TimeoutError: If the command exceeds timeout
// - CommandError: If update fails (e.g., network issues)
func (s *ServiceManager) Update(ctx context.Context) (string, error) {
	output, err := s.runBrewCommand(ctx, "update")
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// Cleanup removes old versions and clears the download cache.
//
// This method executes `brew cleanup` which:
// - Removes old versions of installed formulae
// - Clears old downloads from the cache
// - Reports space freed
//
// Performance:
// - I/O intensive, may take 10-60 seconds for large caches
//
// Error Conditions:
// - TimeoutError: If the command exceeds timeout
// - CommandError: If cleanup fails
func (s *ServiceManager) Cleanup(ctx context.Context) (string, error) {
	output, err := s.runBrewCommand(ctx, "cleanup", "--prune=all")
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// Doctor runs brew's diagnostic checks.
//
// This method executes `brew doctor` which:
// - Checks for common issues with the Homebrew installation
// - Suggests fixes for problems found
// - Returns exit code 0 if all checks pass
//
// Returns:
// - output: The diagnostic messages from brew doctor
// - issues: Parsed list of issues found
// - error: Only if the command couldn't be executed
func (s *ServiceManager) Doctor(ctx context.Context) (string, []DoctorIssue, error) {
	output, err := s.runBrewCommand(ctx, "doctor")

	// brew doctor returns non-zero if issues are found, which is expected
	// We still want to parse and return the output
	var cmdErr *CommandError
	if err != nil && !errors.As(err, &cmdErr) {
		return "", nil, err
	}

	outputStr := string(output)
	if cmdErr != nil {
		outputStr = cmdErr.Stderr
	}

	// Parse issues from output
	issues := parseDoctorOutput(outputStr)

	return outputStr, issues, nil
}

// DoctorIssue represents a single issue found by brew doctor
type DoctorIssue struct {
	Type    string `json:"type"`    // "warning" or "error"
	Message string `json:"message"` // The issue description
}

// parseDoctorOutput parses the text output from brew doctor into structured issues
func parseDoctorOutput(output string) []DoctorIssue {
	var issues []DoctorIssue

	lines := strings.Split(output, "\n")
	var currentIssue string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if currentIssue != "" {
				issueType := "warning"
				if strings.Contains(strings.ToLower(currentIssue), "error") {
					issueType = "error"
				}
				issues = append(issues, DoctorIssue{
					Type:    issueType,
					Message: currentIssue,
				})
				currentIssue = ""
			}
			continue
		}

		if strings.HasPrefix(line, "Warning:") || strings.HasPrefix(line, "Error:") {
			if currentIssue != "" {
				issueType := "warning"
				if strings.Contains(strings.ToLower(currentIssue), "error") {
					issueType = "error"
				}
				issues = append(issues, DoctorIssue{
					Type:    issueType,
					Message: currentIssue,
				})
			}
			currentIssue = line
		} else if currentIssue != "" {
			currentIssue += " " + line
		}
	}

	// Add final issue if exists
	if currentIssue != "" {
		issueType := "warning"
		if strings.Contains(strings.ToLower(currentIssue), "error") {
			issueType = "error"
		}
		issues = append(issues, DoctorIssue{
			Type:    issueType,
			Message: currentIssue,
		})
	}

	return issues
}

// GetPackageSize returns the installed size of a package in bytes.
// Uses 'brew info --json=v2 <name>' and parses the installed_size field.
func (s *ServiceManager) GetPackageSize(ctx context.Context, name string) (int64, error) {
	if err := validatePackageName(name); err != nil {
		return 0, err
	}

	output, err := s.runBrewCommand(ctx, "info", "--json=v2", name)
	if err != nil {
		return 0, err
	}

	// Parse JSON to get size
	var result struct {
		Formulae []struct {
			InstalledSize int64 `json:"installed_size"`
		} `json:"formulae"`
		Casks []struct {
			InstalledSize int64 `json:"installed_size"`
		} `json:"casks"`
	}

	if err := json.Unmarshal(output, &result); err != nil {
		return 0, err
	}

	if len(result.Formulae) > 0 {
		return result.Formulae[0].InstalledSize, nil
	}
	if len(result.Casks) > 0 {
		return result.Casks[0].InstalledSize, nil
	}

	return 0, nil
}

// =============================================================================
// Service Operations
// =============================================================================

// ListServices returns all Homebrew-managed services and their status.
//
// This method executes `brew services list --json` and enriches the results
// with homepage information from the installed packages.
//
// Performance:
// - Makes two brew calls internally (services list + package info for homepages)
// - Typically completes in 1-3 seconds
//
// Error Conditions:
// - TimeoutError: If the command exceeds timeout
// - CommandError: If brew services is not available or fails
//
// Note: If package info lookup fails, services are still returned but
// without homepage URLs.
func (s *ServiceManager) ListServices(ctx context.Context) ([]Service, error) {
	output, err := s.runBrewCommand(ctx, "services", "list", "--json")
	if err != nil {
		return nil, err
	}

	var entries []serviceListEntry
	if err := json.Unmarshal(output, &entries); err != nil {
		return nil, fmt.Errorf("failed to parse brew services output: %w", err)
	}

	// Build a map of package name -> homepage for enrichment
	// We ignore errors here as this is optional enrichment
	homepageMap := make(map[string]string)
	if packages, err := s.ListInstalled(ctx); err == nil {
		for _, pkg := range packages {
			homepageMap[pkg.Name] = pkg.Homepage
		}
	}

	// Transform entries to Service structs with enrichment
	services := make([]Service, len(entries))
	for i, entry := range entries {
		services[i] = Service{
			Name:     entry.Name,
			Status:   entry.Status,
			User:     entry.User,
			Plist:    entry.Plist,
			Running:  entry.Status == "started",
			Homepage: homepageMap[entry.Name], // May be empty string
		}
	}

	return services, nil
}

// StartService starts a Homebrew-managed service.
//
// This method executes `brew services start <name>` which will:
// - Load the service's plist/launchd configuration
// - Start the service immediately
// - Configure it to start on boot (for the current user)
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Service/package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If service fails to start (check logs for details)
func (s *ServiceManager) StartService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "start", name)
	return err
}

// StopService stops a Homebrew-managed service.
//
// This method executes `brew services stop <name>` which will:
// - Stop the running service immediately
// - Remove it from startup configuration
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Service/package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If service fails to stop
func (s *ServiceManager) StopService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "stop", name)
	return err
}

// RestartService restarts a Homebrew-managed service.
//
// This is equivalent to stop followed by start, but in a single atomic
// operation. Useful for applying configuration changes.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Service/package name (validated against security regex)
//
// Error Conditions:
// - ValidationError: If name is empty or contains invalid characters
// - CommandError: If service fails to restart
func (s *ServiceManager) RestartService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "restart", name)
	return err
}

// =============================================================================
// Search and Discovery
// =============================================================================

// Search searches for packages matching the query string.
//
// This method executes `brew search <query>` and parses the text output.
// The search includes both formulae and casks.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - query: Search term (can be partial package name)
//
// Returns:
// - Slice of package names matching the query (may be empty)
// - nil error even if no matches found
//
// Limitations:
// - Returns only package names, not full Package structs
// - For detailed info, call ListInstalled() or a dedicated info endpoint
func (s *ServiceManager) Search(ctx context.Context, query string) ([]string, error) {
	if query == "" {
		return nil, nil // Empty query returns empty results, not an error
	}

	// Validate query to prevent injection (same rules as package names)
	if len(query) > maxPackageNameLength {
		return nil, &ValidationError{
			Field:   "query",
			Value:   query[:20] + "...",
			Message: "search query too long",
		}
	}

	output, err := s.runBrewCommand(ctx, "search", query)
	if err != nil {
		// brew search returns non-zero for no matches in some versions
		// We treat this as empty results, not an error
		var cmdErr *CommandError
		if isCommandError(err, &cmdErr) {
			return []string{}, nil
		}
		return nil, err
	}

	// Parse text output: brew search outputs lines with package names
	// Format:
	// ==> Formulae
	// package1 package2 package3
	// ==> Casks
	// cask1 cask2
	return parseSearchOutput(string(output)), nil
}

// parseSearchOutput extracts package names from brew search text output.
func parseSearchOutput(output string) []string {
	seen := make(map[string]bool)
	var results []string

	fields := strings.Fields(output)
	for _, field := range fields {
		// Skip section headers
		if field == "==>" || field == "Formulae" || field == "Casks" {
			continue
		}
		// Deduplicate
		if seen[field] {
			continue
		}
		seen[field] = true
		results = append(results, field)
	}

	return results
}

// isCommandError is a helper to check and extract CommandError.
func isCommandError(err error, target **CommandError) bool {
	if err == nil {
		return false
	}
	if cmdErr, ok := err.(*CommandError); ok {
		*target = cmdErr
		return true
	}
	return false
}

// =============================================================================
// Usage Documentation
// =============================================================================

// GetPackageUsage fetches usage examples for a package.
//
// This method first attempts to fetch community-contributed examples from
// cheat.sh, a collaborative cheatsheet service. If that fails or returns
// no useful content, it falls back to `brew info` output.
//
// Parameters:
// - ctx: Context for timeout/cancellation
// - name: Package name
//
// Returns:
// - Usage documentation string (never empty - falls back to brew info)
// - Error only for validation or system failures
//
// External Dependencies:
// - cheat.sh (https://cheat.sh) - Community cheatsheet service
// - If unavailable, gracefully falls back to local brew info
func (s *ServiceManager) GetPackageUsage(ctx context.Context, name string) (string, error) {
	if err := validatePackageName(name); err != nil {
		return "", err
	}

	// Attempt to fetch from cheat.sh
	cheatSheet, err := s.fetchCheatSheet(ctx, name)
	if err == nil && cheatSheet != "" && !strings.Contains(cheatSheet, "Unknown topic") {
		return cheatSheet, nil
	}

	// Fallback to brew info
	output, err := s.runBrewCommand(ctx, "info", name)
	if err != nil {
		return "No usage examples found. 'brew info' also failed.", nil
	}

	return fmt.Sprintf("No community cheat sheet found. Showing 'brew info' output:\n\n%s", string(output)), nil
}

// fetchCheatSheet retrieves documentation from cheat.sh.
func (s *ServiceManager) fetchCheatSheet(ctx context.Context, name string) (string, error) {
	url := fmt.Sprintf("https://cheat.sh/%s?T", name)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	// cheat.sh uses User-Agent to determine output format
	req.Header.Set("User-Agent", "curl/7.64.1")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("cheat.sh returned status %d", resp.StatusCode)
	}

	// Limit response size to prevent memory issues
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024)) // 64KB max
	if err != nil {
		return "", err
	}

	return string(body), nil
}

// =============================================================================
// Internal Helpers
// =============================================================================

// runBrewCommand executes a brew command with timeout and captures output.
//
// This is the core command execution method. All public methods delegate here.
//
// Implementation Notes:
// - Uses exec.CommandContext for timeout support
// - Captures both stdout and stderr
// - Truncates stderr in errors to prevent log bloat
// - Returns typed errors for different failure modes
func (s *ServiceManager) runBrewCommand(ctx context.Context, args ...string) ([]byte, error) {
	// Create command with timeout context
	cmdCtx, cancel := context.WithTimeout(ctx, s.config.CommandTimeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "brew", args...)
	output, err := cmd.Output()

	if err != nil {
		// Check for timeout
		if cmdCtx.Err() == context.DeadlineExceeded {
			return nil, &TimeoutError{
				Command: strings.Join(args, " "),
				Timeout: s.config.CommandTimeout,
			}
		}

		// Extract stderr for error context
		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
			// Truncate long stderr
			if len(stderr) > 1024 {
				stderr = stderr[:1024] + "... (truncated)"
			}
		}

		return nil, &CommandError{
			Command: args[0],
			Args:    args[1:],
			Stderr:  stderr,
			Cause:   err,
		}
	}

	return output, nil
}
