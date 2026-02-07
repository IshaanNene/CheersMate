import type { UserData, UsageStat, PackageGroup, UninstalledPackage, BrewPackage, PackageCategory, CATEGORY_KEYWORDS } from './types';
import { DEFAULT_USER_DATA } from './types';

const STORAGE_KEY = 'brew-manager-user-data';
const MAX_SEARCH_HISTORY = 20;
const MAX_UNINSTALLED_HISTORY = 50;

export function getUserData(): UserData {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return { ...DEFAULT_USER_DATA, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error('Failed to parse user data:', e);
    }
    return { ...DEFAULT_USER_DATA };
}

export function saveUserData(data: UserData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save user data:', e);
    }
}

export function isFavorite(packageName: string): boolean {
    return getUserData().favorites.includes(packageName);
}

export function toggleFavorite(packageName: string): boolean {
    const data = getUserData();
    const index = data.favorites.indexOf(packageName);

    if (index > -1) {
        data.favorites.splice(index, 1);
        saveUserData(data);
        return false; 

    } else {
        data.favorites.push(packageName);
        saveUserData(data);
        return true; 

    }
}

export function getFavorites(): string[] {
    return getUserData().favorites;
}

export function getGroups(): PackageGroup[] {
    return getUserData().groups;
}

export function createGroup(name: string, color: string = '#FFBE98'): PackageGroup {
    const data = getUserData();
    const group: PackageGroup = {
        id: `group-${Date.now()}`,
        name,
        color,
        packages: [],
        createdAt: new Date().toISOString()
    };
    data.groups.push(group);
    saveUserData(data);
    return group;
}

export function deleteGroup(groupId: string): void {
    const data = getUserData();
    data.groups = data.groups.filter(g => g.id !== groupId);
    saveUserData(data);
}

export function addToGroup(groupId: string, packageName: string): void {
    const data = getUserData();
    const group = data.groups.find(g => g.id === groupId);
    if (group && !group.packages.includes(packageName)) {
        group.packages.push(packageName);
        saveUserData(data);
    }
}

export function removeFromGroup(groupId: string, packageName: string): void {
    const data = getUserData();
    const group = data.groups.find(g => g.id === groupId);
    if (group) {
        group.packages = group.packages.filter(p => p !== packageName);
        saveUserData(data);
    }
}

export function getPackageGroups(packageName: string): PackageGroup[] {
    return getUserData().groups.filter(g => g.packages.includes(packageName));
}

export function trackPackageAccess(packageName: string): void {
    const data = getUserData();
    const stat = data.usageStats[packageName] || {
        packageName,
        clickCount: 0,
        lastAccessed: ''
    };

    stat.clickCount++;
    stat.lastAccessed = new Date().toISOString();
    data.usageStats[packageName] = stat;
    saveUserData(data);
}

export function getUsageStats(): Record<string, UsageStat> {
    return getUserData().usageStats;
}

export function getPackageUsageCount(packageName: string): number {
    return getUserData().usageStats[packageName]?.clickCount || 0;
}

export function addToUninstalled(pkg: BrewPackage): void {
    const data = getUserData();
    const entry: UninstalledPackage = {
        name: pkg.name,
        version: pkg.installed[0]?.version || 'unknown',
        uninstalledAt: new Date().toISOString(),
        desc: pkg.desc
    };

    data.recentlyUninstalled = data.recentlyUninstalled.filter(p => p.name !== pkg.name);

    data.recentlyUninstalled.unshift(entry);

    if (data.recentlyUninstalled.length > MAX_UNINSTALLED_HISTORY) {
        data.recentlyUninstalled = data.recentlyUninstalled.slice(0, MAX_UNINSTALLED_HISTORY);
    }

    saveUserData(data);
}

export function getRecentlyUninstalled(): UninstalledPackage[] {
    return getUserData().recentlyUninstalled;
}

export function removeFromUninstalled(packageName: string): void {
    const data = getUserData();
    data.recentlyUninstalled = data.recentlyUninstalled.filter(p => p.name !== packageName);
    saveUserData(data);
}

export function addSearchHistory(query: string): void {
    if (!query.trim()) return;

    const data = getUserData();

    data.searchHistory = data.searchHistory.filter(q => q !== query);

    data.searchHistory.unshift(query);

    if (data.searchHistory.length > MAX_SEARCH_HISTORY) {
        data.searchHistory = data.searchHistory.slice(0, MAX_SEARCH_HISTORY);
    }

    saveUserData(data);
}

export function getSearchHistory(): string[] {
    return getUserData().searchHistory;
}

export function clearSearchHistory(): void {
    const data = getUserData();
    data.searchHistory = [];
    saveUserData(data);
}

const CATEGORY_KEYWORDS_MAP: Record<PackageCategory, string[]> = {
    development: ['compiler', 'language', 'runtime', 'sdk', 'ide', 'git', 'node', 'python', 'go', 'rust', 'java', 'ruby', 'php', 'swift', 'kotlin', 'llvm', 'gcc', 'cmake', 'make', 'debug', 'build', 'dev'],
    database: ['database', 'sql', 'postgres', 'mysql', 'redis', 'mongo', 'sqlite', 'mariadb', 'cassandra', 'elastic', 'db'],
    web: ['nginx', 'apache', 'http', 'web', 'server', 'proxy', 'caddy', 'html', 'css'],
    media: ['image', 'video', 'audio', 'ffmpeg', 'imagemagick', 'gimp', 'vlc', 'mp3', 'jpeg', 'png', 'graphic', 'photo'],
    network: ['network', 'curl', 'wget', 'ssh', 'ftp', 'dns', 'vpn', 'proxy', 'nmap', 'wireshark', 'socket', 'tcp', 'udp'],
    security: ['security', 'crypto', 'encrypt', 'ssl', 'tls', 'gpg', 'password', 'vault', 'auth', 'hash'],
    system: ['system', 'util', 'core', 'lib', 'terminal', 'shell', 'bash', 'zsh', 'tmux', 'htop', 'gnu', 'coreutils'],
    other: []
};

export function detectCategory(pkg: BrewPackage): PackageCategory {
    const searchText = `${pkg.name} ${pkg.desc || ''}`.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS_MAP)) {
        if (category === 'other') continue;

        for (const keyword of keywords) {
            if (searchText.includes(keyword)) {
                return category as PackageCategory;
            }
        }
    }

    return 'other';
}

export function sortByFrequency(packages: BrewPackage[]): BrewPackage[] {
    const stats = getUsageStats();
    return [...packages].sort((a, b) => {
        const aCount = stats[a.name]?.clickCount || 0;
        const bCount = stats[b.name]?.clickCount || 0;
        return bCount - aCount;
    });
}

export function getAutoUpdateConfig() {
    return getUserData().autoUpdateSchedule;
}

export function setAutoUpdateConfig(config: Partial<typeof DEFAULT_USER_DATA.autoUpdateSchedule>): void {
    const data = getUserData();
    data.autoUpdateSchedule = { ...data.autoUpdateSchedule, ...config };
    saveUserData(data);
}

