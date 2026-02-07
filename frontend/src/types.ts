/**
 * Type Definitions Module - Extended with Sorting/Filtering/Features
 */

// =============================================================================
// Package Types
// =============================================================================

/**
 * Extended BrewPackage with additional metadata for sorting/filtering
 */
export interface BrewPackage {
    name: string;
    full_name: string;
    desc: string;
    homepage: string;
    versions: {
        stable: string;
    };
    installed: {
        version: string;
        installed_on_request?: boolean;
        installed_as_dependency?: boolean;
    }[];
    outdated: boolean;
    pinned: boolean;
    dependencies: string[];
    build_dependencies: string[];
    caveats: string | null;
    conflicts_with: string[];

    // Extended fields for sorting/filtering
    /** Disk size in bytes (from brew info --json) */
    installed_size?: number;
    /** Installation timestamp */
    install_date?: string;
    /** Whether this is a cask (GUI app) or formula (CLI) */
    is_cask?: boolean;
    /** Whether any other package depends on this */
    is_dependency?: boolean;
    /** Whether this is a leaf package (nothing depends on it) */
    is_leaf?: boolean;
    /** Auto-computed category based on name/description */
    category?: PackageCategory;
    /** Number of packages that depend on this */
    dependents_count?: number;
}

// =============================================================================
// Service Types
// =============================================================================

export type ServiceStatus = 'started' | 'stopped' | 'none' | 'unknown' | 'error';

export interface BrewService {
    name: string;
    status: ServiceStatus;
    user: string;
    file: string;
    running: boolean;
    homepage: string;
}

// =============================================================================
// Sorting & Filtering Types
// =============================================================================

export type SortOption =
    | 'name-asc'
    | 'name-desc'
    | 'size-desc'
    | 'size-asc'
    | 'date-desc'       // Recently installed first
    | 'date-asc'        // Oldest first
    | 'deps-desc'       // Most dependencies first
    | 'frequency-desc'; // Most used first (tracked locally)

export type FilterOption =
    | 'all'
    | 'updates'         // Has updates available
    | 'pinned'          // Only pinned
    | 'casks'           // GUI apps only
    | 'formulae'        // CLI tools only
    | 'dependencies'    // Is a dependency
    | 'leaf'            // Leaf packages
    | 'favorites';      // User favorites

export type PackageCategory =
    | 'development'     // Dev tools, languages, compilers
    | 'database'        // DBs like postgres, mysql, redis
    | 'web'             // Web servers, frameworks
    | 'media'           // Image, video, audio tools
    | 'network'         // Network utilities
    | 'security'        // Security tools
    | 'system'          // System utilities
    | 'other';          // Default

// =============================================================================
// User Data Types (stored in localStorage)
// =============================================================================

/**
 * User preferences and custom data
 */
export interface UserData {
    /** Favorite package names */
    favorites: string[];
    /** Custom package groups */
    groups: PackageGroup[];
    /** Usage frequency tracking */
    usageStats: Record<string, UsageStat>;
    /** Recently uninstalled packages for reinstall */
    recentlyUninstalled: UninstalledPackage[];
    /** Search history */
    searchHistory: string[];
    /** Auto-update configuration */
    autoUpdateSchedule: AutoUpdateConfig;
}

export interface PackageGroup {
    id: string;
    name: string;
    color: string;
    packages: string[];
    createdAt: string;
}

export interface UsageStat {
    packageName: string;
    clickCount: number;
    lastAccessed: string;
}

export interface UninstalledPackage {
    name: string;
    version: string;
    uninstalledAt: string;
    desc?: string;
}

export interface AutoUpdateConfig {
    enabled: boolean;
    intervalDays: number;
    lastRun?: string;
    excludedPackages: string[];
}

// =============================================================================
// API Response Types
// =============================================================================

export interface HealthCheckResult {
    issues: HealthIssue[];
    isHealthy: boolean;
    checkedAt: string;
}

export interface HealthIssue {
    type: 'warning' | 'error';
    message: string;
    suggestion?: string;
}

export interface BrewfileExport {
    content: string;
    packageCount: number;
    generatedAt: string;
}

export interface DependencyNode {
    name: string;
    children: DependencyNode[];
    isInstalled: boolean;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isBrewPackage(value: unknown): value is BrewPackage {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj.name === 'string' &&
        typeof obj.full_name === 'string' &&
        typeof obj.homepage === 'string' &&
        typeof obj.outdated === 'boolean' &&
        Array.isArray(obj.installed)
    );
}

export function isBrewService(value: unknown): value is BrewService {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj.name === 'string' &&
        typeof obj.status === 'string' &&
        typeof obj.running === 'boolean'
    );
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_USER_DATA: UserData = {
    favorites: [],
    groups: [],
    usageStats: {},
    recentlyUninstalled: [],
    searchHistory: [],
    autoUpdateSchedule: {
        enabled: false,
        intervalDays: 7,
        excludedPackages: []
    }
};

// Category detection keywords
export const CATEGORY_KEYWORDS: Record<PackageCategory, string[]> = {
    development: ['compiler', 'language', 'runtime', 'sdk', 'ide', 'git', 'node', 'python', 'go', 'rust', 'java', 'ruby', 'php', 'swift', 'kotlin', 'llvm', 'gcc', 'cmake', 'make', 'debug'],
    database: ['database', 'sql', 'postgres', 'mysql', 'redis', 'mongo', 'sqlite', 'mariadb', 'cassandra', 'elastic'],
    web: ['nginx', 'apache', 'http', 'web', 'server', 'proxy', 'caddy'],
    media: ['image', 'video', 'audio', 'ffmpeg', 'imagemagick', 'gimp', 'vlc', 'mp3', 'jpeg', 'png'],
    network: ['network', 'curl', 'wget', 'ssh', 'ftp', 'dns', 'vpn', 'proxy', 'nmap', 'wireshark'],
    security: ['security', 'crypto', 'encrypt', 'ssl', 'tls', 'gpg', 'password', 'vault', 'auth'],
    system: ['system', 'util', 'core', 'lib', 'terminal', 'shell', 'bash', 'zsh', 'tmux', 'htop'],
    other: []
};
