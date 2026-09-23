import {PlannedUrl, SitemapSourceEntry} from './types';

export class SitemapPlanner {
    plan(entry: SitemapSourceEntry): PlannedUrl {
        const priority = entry.sitemapPriority === undefined
            ? this.priorityFromPath(entry.url)
            : this.priorityFromSitemap(entry.sitemapPriority);

        return {
            url: entry.url,
            mustBeCached: true,
            targetResponseTimeMs: 200,
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
        const bounded = Math.max(0, Math.min(1, value));
        return Math.round(bounded * 4) + 1;
    }

    private priorityFromPath(value: string): number {
        const depth = new URL(value).pathname.split('/').filter(Boolean).length;
        return Math.max(1, 5 - depth);
    }
}
