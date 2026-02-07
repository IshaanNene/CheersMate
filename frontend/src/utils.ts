export interface LogoUrls {

    primary: string;

    fallback: string;
}

export function getLogoUrl(homepageUrl: string): LogoUrls | null {

    if (!homepageUrl) {
        return null;
    }

    try {
        const url = new URL(homepageUrl);
        const hostname = url.hostname;

        let primary = `https://logo.clearbit.com/${hostname}`;

        if (hostname.includes('github.com')) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 1) {
                const owner = pathParts[0];
                primary = `https://github.com/${owner}.png`;
            }
        }

        const fallback = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;

        return { primary, fallback };
    } catch {

        return null;
    }
}

export function getUiAvatar(name: string): string {

    const encodedName = encodeURIComponent(name);

    return `https://ui-avatars.com/api/?name=${encodedName}&background=random&color=fff&size=128&font-size=0.5`;
}

export function truncate(text: string, maxLength: number = 100): string {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength - 3) + '...';
}

export function formatVersion(
    version: string | null | undefined,
    placeholder: string = '???'
): string {
    if (!version) {
        return placeholder;
    }

    if (version.startsWith('v')) {
        return version;
    }

    return `v${version}`;
}

export function getHostname(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

export function isGitHubUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname;
        return hostname === 'github.com' || hostname.endsWith('.github.com');
    } catch {
        return false;
    }
}

