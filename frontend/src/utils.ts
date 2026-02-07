/**
 * Utility Functions Module
 * 
 * Helper functions used across the application for common operations.
 * 
 * This module contains:
 * - Logo/avatar URL generation for package display
 * - String manipulation utilities
 * - URL parsing helpers
 * 
 * Design Principles:
 * - Pure functions with no side effects
 * - Defensive programming with graceful fallbacks
 * - Type-safe with clear input/output contracts
 */

// =============================================================================
// Logo URL Generation
// =============================================================================

/**
 * Result of logo URL generation.
 * 
 * Provides both primary and fallback URLs for resilient image loading.
 * The UI should try primary first, then fallback on error.
 */
export interface LogoUrls {
    /** Primary logo URL (Clearbit or GitHub avatar) */
    primary: string;
    /** Fallback URL (Google favicon service) */
    fallback: string;
}

/**
 * Generates logo URLs for a package based on its homepage.
 * 
 * Uses a tiered approach for logo sources:
 * 1. GitHub avatar (if homepage is a GitHub URL)
 * 2. Clearbit logo API (for other domains)
 * 3. Google Favicon service (as fallback)
 * 
 * @param homepageUrl - The homepage URL of the package
 * @returns LogoUrls object with primary and fallback URLs, or null if URL is invalid
 * 
 * @example
 * ```typescript
 * const logos = getLogoUrl("https://github.com/nodejs/node");
 * // logos.primary = "https://github.com/nodejs.png"
 * // logos.fallback = "https://www.google.com/s2/favicons?domain=github.com&sz=128"
 * 
 * const logos2 = getLogoUrl("https://www.postgresql.org/");
 * // logos2.primary = "https://logo.clearbit.com/www.postgresql.org"
 * // logos2.fallback = "https://www.google.com/s2/favicons?domain=www.postgresql.org&sz=128"
 * ```
 * 
 * @remarks
 * URL Parsing:
 * - Uses the URL constructor for safe parsing
 * - Returns null for invalid URLs rather than throwing
 * 
 * GitHub Detection:
 * - Checks if hostname includes "github.com"
 * - Extracts the organization/user from the path
 * - Uses GitHub's avatar endpoint for consistent branding
 * 
 * Performance:
 * - Pure function with no caching (caller should cache if needed)
 * - Synchronous operation
 */
export function getLogoUrl(homepageUrl: string): LogoUrls | null {
    // Guard against empty or missing URLs
    if (!homepageUrl) {
        return null;
    }

    try {
        const url = new URL(homepageUrl);
        const hostname = url.hostname;

        // Default to Clearbit
        let primary = `https://logo.clearbit.com/${hostname}`;

        // Special case: GitHub repositories
        // GitHub URLs follow pattern: github.com/{owner}/{repo}
        // We use the owner's avatar for consistent branding
        if (hostname.includes('github.com')) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 1) {
                const owner = pathParts[0];
                primary = `https://github.com/${owner}.png`;
            }
        }

        // Google Favicon as reliable fallback
        // Supports size parameter for higher resolution
        const fallback = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;

        return { primary, fallback };
    } catch {
        // URL constructor throws on invalid URLs
        // Return null to indicate no logo is available
        return null;
    }
}

/**
 * Generates a UI Avatars URL for use when no logo is available.
 * 
 * UI Avatars service generates letter-based avatars with random colors.
 * This provides a consistent fallback for packages without logos.
 * 
 * @param name - Name to generate avatar for (typically package name)
 * @returns URL string for the generated avatar
 * 
 * @example
 * ```typescript
 * const avatar = getUiAvatar("postgresql");
 * // Returns: "https://ui-avatars.com/api/?name=postgresql&background=random&color=fff&size=128&font-size=0.5"
 * ```
 * 
 * @remarks
 * Avatar Characteristics:
 * - Uses first letters of the name
 * - Random background color (consistent per name via service)
 * - White text for contrast
 * - 128x128 pixel size
 * 
 * Note: The service is external and may be rate-limited for high usage.
 * Consider caching avatar URLs in production.
 */
export function getUiAvatar(name: string): string {
    // Encode name for URL safety
    const encodedName = encodeURIComponent(name);

    return `https://ui-avatars.com/api/?name=${encodedName}&background=random&color=fff&size=128&font-size=0.5`;
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Truncates a string to a maximum length with ellipsis.
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis (default: 100)
 * @returns Truncated string with "..." if it exceeded maxLength
 * 
 * @example
 * ```typescript
 * truncate("Hello, World!", 8); // "Hello..."
 * truncate("Hi", 10); // "Hi"
 * ```
 */
export function truncate(text: string, maxLength: number = 100): string {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Formats a version string for display.
 * 
 * Handles common version edge cases:
 * - Adds 'v' prefix if missing
 * - Returns placeholder for empty/null versions
 * 
 * @param version - Version string to format
 * @param placeholder - Text to show if version is empty (default: "???")
 * @returns Formatted version string
 * 
 * @example
 * ```typescript
 * formatVersion("1.2.3"); // "v1.2.3"
 * formatVersion("v2.0.0"); // "v2.0.0"
 * formatVersion(""); // "???"
 * formatVersion(null, "unknown"); // "unknown"
 * ```
 */
export function formatVersion(
    version: string | null | undefined,
    placeholder: string = '???'
): string {
    if (!version) {
        return placeholder;
    }

    // Don't double-prefix
    if (version.startsWith('v')) {
        return version;
    }

    return `v${version}`;
}

// =============================================================================
// URL Utilities
// =============================================================================

/**
 * Safely extracts the hostname from a URL string.
 * 
 * @param url - URL string to parse
 * @returns Hostname or null if URL is invalid
 * 
 * @example
 * ```typescript
 * getHostname("https://www.example.com/path"); // "www.example.com"
 * getHostname("invalid-url"); // null
 * ```
 */
export function getHostname(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * Checks if a URL appears to be a GitHub repository URL.
 * 
 * @param url - URL string to check
 * @returns True if the URL points to GitHub
 */
export function isGitHubUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname;
        return hostname === 'github.com' || hostname.endsWith('.github.com');
    } catch {
        return false;
    }
}
