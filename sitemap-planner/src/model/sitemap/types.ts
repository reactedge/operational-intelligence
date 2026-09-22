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

export interface SitemapSelectionConfig {
    requiredTags: string[];
    maximumTargetResponseTimeMs: number;
    minimumPriority: number;
    limit: number;
}

export interface SitemapSelection {
    matched: number;
    entries: PlannedUrl[];
}
