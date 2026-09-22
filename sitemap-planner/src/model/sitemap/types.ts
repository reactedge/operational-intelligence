export interface SitemapSourceEntry {
    url: string;
    sitemapPriority?: number;
}

export interface PlannedUrl {
    url: string;
    mustBeCached: true;
    targetResponseTimeMs: 200;
    priority: number;
    tags: string[];
    sitemapPriority?: number;
}

export interface SitemapPlan {
    sitemapUrl: string;
    count: number;
    entries: PlannedUrl[];
}
