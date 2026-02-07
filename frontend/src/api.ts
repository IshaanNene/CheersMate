import type { BrewPackage, BrewService } from './types';

const API_BASE_URL = 'http://localhost:8080';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; 

const SHORT_TIMEOUT_MS = 30 * 1000; 

export interface APIErrorResponse {
    error: string;
    code: string;
    details?: Record<string, string>;
}

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

    }

    isNetworkError(): boolean {
        return this.status === 0;
    }

    isClientError(): boolean {
        return this.status >= 400 && this.status < 500;
    }

    isServerError(): boolean {
        return this.status >= 500;
    }

    isRetryable(): boolean {

        return this.isNetworkError() || this.isServerError();
    }
}

interface ActionResponse {
    status: string;
    package?: string;
    service?: string;
    action?: string;
}

interface SystemOperationResponse {
    message: string;
    output: string;
}

interface UsageResponse {
    usage: string;
}

async function fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {

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

        clearTimeout(timeoutId);

        if (!response.ok) {

            let errorData: APIErrorResponse | null = null;
            try {
                errorData = await response.json();
            } catch {

            }

            throw new APIError(
                errorData?.error || response.statusText || 'Request failed',
                errorData?.code || 'HTTP_ERROR',
                response.status,
                errorData?.details
            );
        }

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

        clearTimeout(timeoutId);

        if (err instanceof APIError) {
            throw err;
        }

        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new APIError(
                'Request timed out',
                'TIMEOUT',
                0
            );
        }

        if (err instanceof TypeError) {
            throw new APIError(
                'Network error. Is the backend server running?',
                'NETWORK_ERROR',
                0
            );
        }

        throw new APIError(
            err instanceof Error ? err.message : 'Unknown error',
            'UNKNOWN_ERROR',
            0
        );
    }
}

const packages = {

    async list(): Promise<BrewPackage[]> {
        return fetchWithTimeout<BrewPackage[]>(
            `${API_BASE_URL}/api/packages`,
            { method: 'GET' }
        );
    },

    async upgrade(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/upgrade?name=${encodeURIComponent(name)}`,
            { method: 'POST' }
        );
    },

    async uninstall(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/uninstall?name=${encodeURIComponent(name)}`,
            { method: 'DELETE' }
        );
    },

    async reinstall(name: string): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/reinstall?name=${encodeURIComponent(name)}`,
            { method: 'POST' }
        );
    },

    async pin(name: string, action: 'pin' | 'unpin' = 'pin'): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/packages/pin?name=${encodeURIComponent(name)}&action=${action}`,
            { method: 'POST' }
        );
    },

    async usage(name: string): Promise<string> {
        const response = await fetchWithTimeout<UsageResponse>(
            `${API_BASE_URL}/api/packages/usage?name=${encodeURIComponent(name)}`,
            { method: 'GET' },
            SHORT_TIMEOUT_MS
        );
        return response.usage;
    },

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

const services = {

    async list(): Promise<BrewService[]> {
        return fetchWithTimeout<BrewService[]>(
            `${API_BASE_URL}/api/services`,
            { method: 'GET' }
        );
    },

    async control(
        name: string,
        action: 'start' | 'stop' | 'restart'
    ): Promise<ActionResponse> {
        return fetchWithTimeout<ActionResponse>(
            `${API_BASE_URL}/api/services/control?name=${encodeURIComponent(name)}&action=${action}`,
            { method: 'POST' }
        );
    },

    async start(name: string): Promise<ActionResponse> {
        return this.control(name, 'start');
    },

    async stop(name: string): Promise<ActionResponse> {
        return this.control(name, 'stop');
    },

    async restart(name: string): Promise<ActionResponse> {
        return this.control(name, 'restart');
    },
};

const system = {

    async update(): Promise<SystemOperationResponse> {
        return fetchWithTimeout<SystemOperationResponse>(
            `${API_BASE_URL}/api/system/update`,
            { method: 'POST' }
        );
    },

    async cleanup(): Promise<SystemOperationResponse> {
        return fetchWithTimeout<SystemOperationResponse>(
            `${API_BASE_URL}/api/system/cleanup`,
            { method: 'POST' }
        );
    },
};

export const api = {
    packages,
    services,
    system,
};

export default api;

