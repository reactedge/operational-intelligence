import { SitemapEntry } from "./types";

export class SitemapReader {
    async read(siteMapUrl: string): Promise<SitemapEntry[]> {
        let xml: string;

        try {
            const response = await fetch(siteMapUrl);

            if (!response.ok) {
                throw new Error(
                    `Unable to fetch sitemap: ${response.status}`
                );
            }

            xml = await response.text();
        } catch (e) {
            throw new Error(
                `Failed to retrieve sitemap: ${e instanceof Error ? e.message : e}`
            );
        }

        const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
            .map(match => this.parseUrlBlock(match[1]))
            .filter((entry): entry is SitemapEntry => entry !== null);

        if (entries.length === 0) {
            throw new Error('No URLs found in sitemap.');
        }

        return entries;
    }

    private parseUrlBlock(block: string): SitemapEntry | null {
        const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1]?.trim();

        if (!loc) {
            return null;
        }

        const priorityValue = block.match(/<priority>(.*?)<\/priority>/)?.[1]?.trim();
        const priority = priorityValue === undefined
            ? undefined
            : Number(priorityValue);

        return {
            id: this.extractId(loc),
            url: loc,
            label: this.extractLabel(loc),
            priority: Number.isFinite(priority) ? priority : undefined,
        };
    }

    private extractLabel(url: string): string {
        const pathname = new URL(url).pathname;
        const segments = pathname.split('/').filter(Boolean);

        if (segments.length === 0) {
            return 'home';
        }

        return segments.at(-1)!.replace('.html', '');
    }

    private extractId(url: string): string {
        const pathname = new URL(url).pathname;

        if (pathname === '/') {
            return 'home';
        }

        return pathname
            .replace(/^\/+/, '')
            .replace(/\.html$/, '');
    }
}
