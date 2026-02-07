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

type Config struct {

	CommandTimeout time.Duration

	HTTPTimeout time.Duration
}

func DefaultConfig() Config {
	return Config{
		CommandTimeout: 5 * time.Minute,
		HTTPTimeout:    10 * time.Second,
	}
}

type ValidationError struct {
	Field   string 

	Value   string 

	Message string 

}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error on field %q: %s", e.Field, e.Message)
}

type CommandError struct {
	Command string   

	Args    []string 

	Stderr  string   

	Cause   error    

}

func (e *CommandError) Error() string {
	return fmt.Sprintf("brew %s failed: %v (stderr: %s)", e.Command, e.Cause, e.Stderr)
}

func (e *CommandError) Unwrap() error {
	return e.Cause
}

type TimeoutError struct {
	Command string        

	Timeout time.Duration 

}

func (e *TimeoutError) Error() string {
	return fmt.Sprintf("brew %s timed out after %v", e.Command, e.Timeout)
}

var packageNameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@._+-]*$`)

const maxPackageNameLength = 128

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
			Value:   name[:20] + "...", 

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
		InstalledTime         int64  `json:"time,omitempty"` 

	} `json:"installed"`
	Outdated          bool     `json:"outdated"`
	Pinned            bool     `json:"pinned"`
	Dependencies      []string `json:"dependencies"`
	BuildDependencies []string `json:"build_dependencies"`
	Caveats           string   `json:"caveats"`
	ConflictsWith     []string `json:"conflicts_with"`

	InstalledSize int64  `json:"installed_size,omitempty"` 

	InstallDate   string `json:"install_date,omitempty"`   

	IsCask        bool   `json:"is_cask"`                  

}

type Service struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	User     string `json:"user"`
	Plist    string `json:"plist"`
	Running  bool   `json:"running"` 

	Homepage string `json:"homepage"`
}

type serviceListEntry struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	User   string `json:"user"`
	Plist  string `json:"file"` 

}

type brewInfoResponse struct {
	Formulae []Package `json:"formulae"`
	Casks    []Package `json:"casks"`
}

type ServiceManager struct {
	config     Config
	httpClient *http.Client
}

func NewService(cfg Config) *ServiceManager {

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

func (s *ServiceManager) ListInstalled(ctx context.Context) ([]Package, error) {
	output, err := s.runBrewCommand(ctx, "info", "--installed", "--json=v2")
	if err != nil {
		return nil, err
	}

	var result brewInfoResponse
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse brew info output: %w", err)
	}

	packages := make([]Package, 0, len(result.Formulae)+len(result.Casks))

	for _, pkg := range result.Formulae {
		pkg.IsCask = false

		if len(pkg.Installed) > 0 && pkg.Installed[0].InstalledTime > 0 {
			pkg.InstallDate = time.Unix(pkg.Installed[0].InstalledTime, 0).Format(time.RFC3339)
		}
		packages = append(packages, pkg)
	}

	for _, pkg := range result.Casks {
		pkg.IsCask = true

		if len(pkg.Installed) > 0 && pkg.Installed[0].InstalledTime > 0 {
			pkg.InstallDate = time.Unix(pkg.Installed[0].InstalledTime, 0).Format(time.RFC3339)
		}
		packages = append(packages, pkg)
	}

	return packages, nil
}

func (s *ServiceManager) UpgradePackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "upgrade", name)
	return err
}

func (s *ServiceManager) UninstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "uninstall", name)
	return err
}

func (s *ServiceManager) ReinstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "reinstall", name)
	return err
}

func (s *ServiceManager) PinPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "pin", name)
	return err
}

func (s *ServiceManager) UnpinPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "unpin", name)
	return err
}

func (s *ServiceManager) InstallPackage(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "install", name)
	return err
}

func (s *ServiceManager) Update(ctx context.Context) (string, error) {
	output, err := s.runBrewCommand(ctx, "update")
	if err != nil {
		return "", err
	}
	return string(output), nil
}

func (s *ServiceManager) Cleanup(ctx context.Context) (string, error) {
	output, err := s.runBrewCommand(ctx, "cleanup", "--prune=all")
	if err != nil {
		return "", err
	}
	return string(output), nil
}

func (s *ServiceManager) Doctor(ctx context.Context) (string, []DoctorIssue, error) {
	output, err := s.runBrewCommand(ctx, "doctor")

	var cmdErr *CommandError
	if err != nil && !errors.As(err, &cmdErr) {
		return "", nil, err
	}

	outputStr := string(output)
	if cmdErr != nil {
		outputStr = cmdErr.Stderr
	}

	issues := parseDoctorOutput(outputStr)

	return outputStr, issues, nil
}

type DoctorIssue struct {
	Type    string `json:"type"`    

	Message string `json:"message"` 

}

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

func (s *ServiceManager) GetPackageSize(ctx context.Context, name string) (int64, error) {
	if err := validatePackageName(name); err != nil {
		return 0, err
	}

	output, err := s.runBrewCommand(ctx, "info", "--json=v2", name)
	if err != nil {
		return 0, err
	}

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

func (s *ServiceManager) ListServices(ctx context.Context) ([]Service, error) {
	output, err := s.runBrewCommand(ctx, "services", "list", "--json")
	if err != nil {
		return nil, err
	}

	var entries []serviceListEntry
	if err := json.Unmarshal(output, &entries); err != nil {
		return nil, fmt.Errorf("failed to parse brew services output: %w", err)
	}

	homepageMap := make(map[string]string)
	if packages, err := s.ListInstalled(ctx); err == nil {
		for _, pkg := range packages {
			homepageMap[pkg.Name] = pkg.Homepage
		}
	}

	services := make([]Service, len(entries))
	for i, entry := range entries {
		services[i] = Service{
			Name:     entry.Name,
			Status:   entry.Status,
			User:     entry.User,
			Plist:    entry.Plist,
			Running:  entry.Status == "started",
			Homepage: homepageMap[entry.Name], 

		}
	}

	return services, nil
}

func (s *ServiceManager) StartService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "start", name)
	return err
}

func (s *ServiceManager) StopService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "stop", name)
	return err
}

func (s *ServiceManager) RestartService(ctx context.Context, name string) error {
	if err := validatePackageName(name); err != nil {
		return err
	}

	_, err := s.runBrewCommand(ctx, "services", "restart", name)
	return err
}

func (s *ServiceManager) Search(ctx context.Context, query string) ([]string, error) {
	if query == "" {
		return nil, nil 

	}

	if len(query) > maxPackageNameLength {
		return nil, &ValidationError{
			Field:   "query",
			Value:   query[:20] + "...",
			Message: "search query too long",
		}
	}

	output, err := s.runBrewCommand(ctx, "search", query)
	if err != nil {

		var cmdErr *CommandError
		if isCommandError(err, &cmdErr) {
			return []string{}, nil
		}
		return nil, err
	}

	return parseSearchOutput(string(output)), nil
}

func parseSearchOutput(output string) []string {
	seen := make(map[string]bool)
	var results []string

	fields := strings.Fields(output)
	for _, field := range fields {

		if field == "==>" || field == "Formulae" || field == "Casks" {
			continue
		}

		if seen[field] {
			continue
		}
		seen[field] = true
		results = append(results, field)
	}

	return results
}

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

func (s *ServiceManager) GetPackageUsage(ctx context.Context, name string) (string, error) {
	if err := validatePackageName(name); err != nil {
		return "", err
	}

	cheatSheet, err := s.fetchCheatSheet(ctx, name)
	if err == nil && cheatSheet != "" && !strings.Contains(cheatSheet, "Unknown topic") {
		return cheatSheet, nil
	}

	output, err := s.runBrewCommand(ctx, "info", name)
	if err != nil {
		return "No usage examples found. 'brew info' also failed.", nil
	}

	return fmt.Sprintf("No community cheat sheet found. Showing 'brew info' output:\n\n%s", string(output)), nil
}

func (s *ServiceManager) fetchCheatSheet(ctx context.Context, name string) (string, error) {
	url := fmt.Sprintf("https://cheat.sh/%s?T", name)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "curl/7.64.1")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("cheat.sh returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024)) 

	if err != nil {
		return "", err
	}

	return string(body), nil
}

func (s *ServiceManager) runBrewCommand(ctx context.Context, args ...string) ([]byte, error) {

	cmdCtx, cancel := context.WithTimeout(ctx, s.config.CommandTimeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "brew", args...)
	output, err := cmd.Output()

	if err != nil {

		if cmdCtx.Err() == context.DeadlineExceeded {
			return nil, &TimeoutError{
				Command: strings.Join(args, " "),
				Timeout: s.config.CommandTimeout,
			}
		}

		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)

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

