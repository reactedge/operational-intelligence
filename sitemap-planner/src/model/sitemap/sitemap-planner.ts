import {PlannedUrl, SitemapSourceEntry} from './types';

const INITIAL_URL_POLICY = {
    mustBeCached: true as const,
    targetResponseTimeMs: 200 as const
};
const MIN_SITEMAP_PRIORITY = 0;
const MAX_SITEMAP_PRIORITY = 1;

export class SitemapPlanner {
    plan(entry: SitemapSourceEntry): PlannedUrl {
        const priority = entry.sitemapPriority === undefined
            ? this.priorityFromPath(entry.url)
            : this.priorityFromSitemap(entry.sitemapPriority);

        return {
            url: entry.url,
            ...INITIAL_URL_POLICY,
            priority,
            tags: [
                'must_be_cached',
                'response_time_under_200ms',
                `priority_${priority}`
            ],
            sitemapPriority: entry.sitemapPriority
        };
    }

    private priorityFromSitemap(value: number): number {
        const bounded = Math.max(
            MIN_SITEMAP_PRIORITY,
            Math.min(MAX_SITEMAP_PRIORITY, value)
        );
        return Math.round(bounded * 4) + 1;
    }

    private priorityFromPath(value: string): number {
        const depth = new URL(value).pathname.split('/').filter(Boolean).length;
        return Math.max(1, 5 - depth);
    }
}
