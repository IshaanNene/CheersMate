/**
 * API Client Module
 * 
 * Centralized HTTP client for all backend API communication.
 * 
 * Architecture:
 * This module provides a single point of entry for all API calls, ensuring
 * consistent error handling, timeout management, and request configuration
 * across the entire frontend application.
 * 
 * Design Decisions:
 * 
 * 1. Centralized Configuration:
 *    - Base URL is configured once, making environment switching trivial
 *    - Default timeout prevents hung requests from blocking UI
 *    - Consistent headers across all requests
 * 
 * 2. Error Handling Strategy:
 *    - All API errors are wrapped in APIError for type safety
 *    - Network errors vs HTTP errors vs validation errors are distinguishable
 *    - Errors include enough context for user-friendly messages
 * 
 * 3. Type Safety:
 *    - Generic fetch wrapper provides compile-time type checking
 *    - API response types are validated at the edge
 * 
 * Usage:
 * 
 *   import { api } from './api';
 * 
 *   // List packages
 *   const packages = await api.packages.list();
 * 
 *   // Upgrade a package
 *   await api.packages.upgrade('node');
 * 
 *   // Handle errors
 *   try {
 *     await api.packages.uninstall('go');
 *   } catch (err) {
 *     if (err instanceof APIError) {
 *       console.log(err.code, err.message);
 *     }
 *   }
 */

import type { BrewPackage, BrewService } from './types';

// =============================================================================
// Configuration
// =============================================================================

/**
 * API base URL. In production, this would come from environment variables.
 * Using localhost for development with the Go backend.
 */
const API_BASE_URL = 'http://localhost:8080';

/**
 * Default request timeout in milliseconds.
 * Set high to accommodate long-running operations like package upgrades.
 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Short timeout for quick operations like search and info fetches.
 */
const SHORT_TIMEOUT_MS = 30 * 1000; // 30 seconds

// =============================================================================
// Error Types
// =============================================================================

/**
 * Structured error from the API.
 * 
 * All backend errors follow this format, allowing the UI to:
 * - Display appropriate user messages based on error code
 * - Log detailed information for debugging
 * - Retry operations where appropriate
 */
export interface APIErrorResponse {
    error: string;
    code: string;
    details?: Record<string, string>;
}

/**
 * Custom error class for API failures.
 * 
 * Includes HTTP status code and structured error data when available.
 * Use instanceof APIError to check if an error came from the API.
 * 
 * Properties:
 * - message: Human-readable error message
 * - code: Machine-readable error code (for programmatic handling)
 * - status: HTTP status code (0 for network errors)
 * - details: Additional context from the server
 */
export class APIError extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly details?: Record<string, string>;

    constructor(
        message: string,
        code: string = 'UNKNOWN_ERROR',
        status: number = 0,
        details?: Record<string, string>
    ) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.status = status;
        this.details = details;

        // Note: Stack trace is automatically captured by Error constructor in modern JS engines
    }

    /**
     * Returns true if this error indicates a network failure (not an HTTP error).
     */
    isNetworkError(): boolean {
        return this.status === 0;
    }

    /**
     * Returns true if this is a client error (4xx).
     */
    isClientError(): boolean {
        return this.status >= 400 && this.status < 500;
    }

    /**
     * Returns true if this is a server error (5xx).
     */
    isServerError(): boolean {
        return this.status >= 500;
    }

    /**
     * Returns true if this operation can potentially succeed on retry.
     */
    isRetryable(): boolean {
        // Network errors and 5xx errors may be transient
        return this.isNetworkError() || this.isServerError();
    }
}

// =============================================================================
// Response Types
// =============================================================================

/** Response from package/service action endpoints */
interface ActionResponse {
    status: string;
    package?: string;
    service?: string;
    action?: string;
}

/** Response from system operation endpoints */
interface SystemOperationResponse {
    message: string;
    output: string;
}

/** Response from package usage endpoint */
interface UsageResponse {
    usage: string;
}

// =============================================================================
// HTTP Client
// =============================================================================

/**
 * Performs a fetch request with timeout, error handling, and JSON parsing.
 * 
 * @typeParam T - Expected response type
 * @param url - Full URL to fetch
 * @param options - Fetch options (method, body, etc.)
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Promise resolving to parsed response data
 * @throws APIError on any failure (network, HTTP, or parsing)
 * 
 * Implementation Notes:
 * - Uses AbortController for timeout (cleaner than setTimeout)
 * - Parses JSON errors from the response body when available
 * - Falls back to status text for non-JSON error responses
 */
async function fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
    // Setup timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        // Clear timeout on successful response
        clearTimeout(timeoutId);

        // Handle non-OK responses
        if (!response.ok) {
            // Try to parse error body
            let errorData: APIErrorResponse | null = null;
            try {
                errorData = await response.json();
            } catch {
                // Response body wasn't JSON, use status text
            }

            throw new APIError(
                errorData?.error || response.statusText || 'Request failed',
                errorData?.code || 'HTTP_ERROR',
                response.status,
                errorData?.details
            );
        }

        // Parse successful response
        // Handle empty responses (204 No Content)
        const text = await response.text();
        if (!text) {
            return {} as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            throw new APIError(
                'Invalid JSON response from server',
                'PARSE_ERROR',
                response.status
            );
        }
    } catch (err) {
        // Clear timeout on error
        clearTimeout(timeoutId);

        // Re-throw APIError as-is
        if (err instanceof APIError) {
            throw err;
        }

        // Handle abort (timeout)
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new APIError(
                'Request timed out',
                'TIMEOUT',
                0
            );
        }

        // Handle network errors
        if (err instanceof TypeError) {
            throw new APIError(
                'Network error. Is the backend server running?',
                'NETWORK_ERROR',
                0
            );
        }

        // Unknown error
        throw new APIError(
            err instanceof Error ? err.message : 'Unknown error',
            'UNKNOWN_ERROR',
            0
        );
    }
}

// =============================================================================
// API Methods
// =============================================================================

/**
 * Package API endpoints.
 * 
 * Provides type-safe methods for all package-related operations.
 * Each method handles parameter encoding and response parsing.
 */
const packages = {
    /**
     * Fetches all installed packages (formulae and casks).
     * 
     * @returns Promise resolving to array of installed packages
     * @throws APIError on failure
     */
    async list(): Promise<BrewPackage[]> {
        return fetchWithTimeout<BrewPackage[]>(
            `${API_BASE_URL}/api/packages`,
            { method: 'GET' }
        );
    },

    /**
     * Upgrades a package to its latest version.
     * 
     * @param name - Package name to upgrade
     * @throws APIError on failure (including if package not found)
     * 
     * Note: This operation can take several minutes for large packages.
     */
    async upgrade(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/upgrade?name=${encodeURIComponent(name)}`,
            { method: 'POST' }
        );
    },

    /**
     * Uninstalls a package.
     * 
     * @param name - Package name to uninstall
     * @throws APIError on failure
     * 
     * Warning: This is a destructive operation.
     */
    async uninstall(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/uninstall?name=${encodeURIComponent(name)}`,
            { method: 'DELETE' }
        );
    },

    /**
     * Reinstalls a package.
     * 
     * @param name - Package name to reinstall
     * @throws APIError on failure
     * 
     * Useful for repairing corrupted installations.
     */
    async reinstall(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/reinstall?name=${encodeURIComponent(name)}`,
            { method: 'POST' }
        );
    },

    /**
     * Pins or unpins a package.
     * 
     * @param name - Package name
     * @param action - 'pin' or 'unpin'
     * @throws APIError on failure
     * 
     * Pinned packages are not upgraded during `brew upgrade`.
     */
    async pin(name: string, action: 'pin' | 'unpin' = 'pin'): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/pin?name=${encodeURIComponent(name)}&action=${action}`,
            { method: 'POST' }
        );
    },

    /**
     * Fetches usage examples for a package.
     * 
     * @param name - Package name
     * @returns Promise resolving to usage documentation string
     * @throws APIError on failure
     * 
     * Data is fetched from cheat.sh with fallback to brew info.
     */
    async usage(name: string): Promise<string> {
        const response = await fetchWithTimeout<UsageResponse>(
            `${API_BASE_URL}/api/packages/usage?name=${encodeURIComponent(name)}`,
            { method: 'GET' },
            SHORT_TIMEOUT_MS
        );
        return response.usage;
    },

    /**
     * Searches for packages matching a query.
     * 
     * @param query - Search term
     * @returns Promise resolving to array of matching package names
     * 
     * Note: Returns package names only, not full Package objects.
     */
    async search(query: string): Promise<string[]> {
        if (!query.trim()) {
            return [];
        }
        return fetchWithTimeout<string[]>(
            `${API_BASE_URL}/api/packages/search?q=${encodeURIComponent(query)}`,
            { method: 'GET' },
            SHORT_TIMEOUT_MS
        );
    },
};

/**
 * Service API endpoints.
 * 
 * Provides type-safe methods for managing Homebrew services.
 */
const services = {
    /**
     * Fetches all Homebrew-managed services.
     * 
     * @returns Promise resolving to array of services with status
     */
    async list(): Promise<BrewService[]> {
        return fetchWithTimeout<BrewService[]>(
            `${API_BASE_URL}/api/services`,
            { method: 'GET' }
        );
    },

    /**
     * Controls a service (start, stop, or restart).
     * 
     * @param name - Service name
     * @param action - 'start', 'stop', or 'restart'
     * @throws APIError on failure
     */
    async control(
        name: string,
        action: 'start' | 'stop' | 'restart'
    ): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/services/control?name=${encodeURIComponent(name)}&action=${action}`,
            { method: 'POST' }
        );
    },

    /** Convenience method to start a service */
    async start(name: string): Promise<ActionResponse> {
        return this.control(name, 'start');
    },

    /** Convenience method to stop a service */
    async stop(name: string): Promise<ActionResponse> {
        return this.control(name, 'stop');
    },

    /** Convenience method to restart a service */
    async restart(name: string): Promise<ActionResponse> {
        return this.control(name, 'restart');
    },
};

/**
 * System API endpoints.
 * 
 * Provides methods for system-wide Homebrew operations.
 */
const system = {
    /**
     * Runs `brew update` to fetch latest package definitions.
     * 
     * @returns Promise with update output
     * @throws APIError on failure
     * 
     * Note: This operation may take 30+ seconds.
     */
    async update(): Promise<SystemOperationResponse> {
        return fetchWithTimeout<SystemOperationResponse>(
            `${API_BASE_URL}/api/system/update`,
            { method: 'POST' }
        );
    },

    /**
     * Runs `brew cleanup` to remove old versions and clear caches.
     * 
     * @returns Promise with cleanup output
     * @throws APIError on failure
     */
    async cleanup(): Promise<SystemOperationResponse> {
        return fetchWithTimeout<SystemOperationResponse>(
            `${API_BASE_URL}/api/system/cleanup`,
            { method: 'POST' }
        );
    },
};

// =============================================================================
// Exports
// =============================================================================

/**
 * Main API client object.
 * 
 * Provides access to all API endpoints through a structured interface.
 * 
 * @example
 * ```typescript
 * import { api } from './api';
 * 
 * // List all packages
 * const packages = await api.packages.list();
 * 
 * // Start a service
 * await api.services.start('postgresql');
 * 
 * // Update Homebrew
 * const result = await api.system.update();
 * console.log(result.output);
 * ```
 */
export const api = {
    packages,
    services,
    system,
};

// Default export for convenience
export default api;
