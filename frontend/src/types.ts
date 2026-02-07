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

    installed_size?: number;

    install_date?: string;

    is_cask?: boolean;

    is_dependency?: boolean;

    is_leaf?: boolean;

    category?: PackageCategory;

    dependents_count?: number;
}

export type ServiceStatus = 'started' | 'stopped' | 'none' | 'unknown' | 'error';

export interface BrewService {
    name: string;
    status: ServiceStatus;
    user: string;
    file: string;
    running: boolean;
    homepage: string;
}

export type SortOption =
    | 'name-asc'
    | 'name-desc'
    | 'size-desc'
    | 'size-asc'
    | 'date-desc'       

    | 'date-asc'        

    | 'deps-desc'       

    | 'frequency-desc'; 

export type FilterOption =
    | 'all'
    | 'updates'         

    | 'pinned'          

    | 'casks'           

    | 'formulae'        

    | 'dependencies'    

    | 'leaf'            

    | 'favorites';      

export type PackageCategory =
    | 'development'     

    | 'database'        

    | 'web'             

    | 'media'           

    | 'network'         

    | 'security'        

    | 'system'          

    | 'other';          

export interface UserData {

    favorites: string[];

    groups: PackageGroup[];

    usageStats: Record<string, UsageStat>;

    recentlyUninstalled: UninstalledPackage[];

    searchHistory: string[];

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

