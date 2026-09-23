import { SitemapReader } from "../model/performance/sitemap-reader";
import { UrlLoader } from "../model/performance/url-loader";
import type { SitemapEntry } from "../model/performance/types";

export interface JourneyTelemetry {
    observe(name: string, attributes?: Record<string, string | number | boolean>): void | Promise<void>;
}

export type SitemapWarmJourneyOptions = {
    sitemapUrl: string;
    minimumPriority: number;
    batchSize: number;
    sitemapReader?: SitemapReader;
    urlLoader?: UrlLoader;
    telemetry: JourneyTelemetry;
};

export type SitemapWarmJourneyResult = {
    discovered: number;
    selected: number;
    warmed: number;
    selectedEntries: SitemapEntry[];
};

export async function runSitemapWarmJourney(
    options: SitemapWarmJourneyOptions,
): Promise<SitemapWarmJourneyResult> {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
        throw new Error("batchSize must be a positive integer");
    }

    const sitemapReader = options.sitemapReader ?? new SitemapReader();
    const urlLoader = options.urlLoader ?? new UrlLoader();

    await options.telemetry.observe("cache_warmer.sitemap_fetch.started", {
        "url.full": options.sitemapUrl,
    });

    const entries = await sitemapReader.read(options.sitemapUrl);

    await options.telemetry.observe("cache_warmer.sitemap_fetch.completed", {
        "cache_warmer.url.discovered": entries.length,
    });

    const selectedEntries = entries
        .filter(entry => (entry.priority ?? 0) >= options.minimumPriority)
        .sort((left, right) => {
            const priorityDifference = (right.priority ?? 0) - (left.priority ?? 0);
            return priorityDifference !== 0
                ? priorityDifference
                : left.url.localeCompare(right.url);
        });

    await options.telemetry.observe("cache_warmer.sitemap_selection.completed", {
        "cache_warmer.url.discovered": entries.length,
        "cache_warmer.url.selected": selectedEntries.length,
        "cache_warmer.minimum_priority": options.minimumPriority,
    });

    let warmed = 0;

    for (let offset = 0; offset < selectedEntries.length; offset += options.batchSize) {
        const batch = selectedEntries.slice(offset, offset + options.batchSize);
        const batchNumber = Math.floor(offset / options.batchSize) + 1;

        await options.telemetry.observe("cache_warmer.batch.started", {
            "cache_warmer.batch.number": batchNumber,
            "cache_warmer.batch.size": batch.length,
        });

        for (const entry of batch) {
            await options.telemetry.observe("cache_warmer.load_url.started", {
                "cache_warmer.page.id": entry.id,
                "url.full": entry.url,
            });

            const result = await urlLoader.fetchText(entry.url);

            await options.telemetry.observe("cache_warmer.load_url.completed", {
                "cache_warmer.page.id": entry.id,
                "url.full": entry.url,
                "cache_warmer.healthy": result.healthy,
                "cache_warmer.duration.ms": result.durationMs,
                ...(result.status === undefined
                    ? {}
                    : { "http.response.status_code": result.status }),
            });

            warmed += 1;
        }

        await options.telemetry.observe("cache_warmer.batch.completed", {
            "cache_warmer.batch.number": batchNumber,
            "cache_warmer.batch.size": batch.length,
        });
    }

    return {
        discovered: entries.length,
        selected: selectedEntries.length,
        warmed,
        selectedEntries,
    };
}
