import { SitemapReader } from "../model/performance/sitemap-reader";
import { UrlLoader } from "../model/performance/url-loader";
import type { SitemapEntry } from "../model/performance/types";
import { validateTargetUrl } from "../lib/url";

export interface JourneyTelemetry {
    observe(name: string, attributes?: Record<string, string | number | boolean>): void | Promise<void>;
}

export type JourneyCapacityDecision =
    | { available: true }
    | { available: false; retryAfterMs: number; reason?: string };

export interface JourneyCapacityPolicy {
    evaluate(): Promise<JourneyCapacityDecision>;
}

export type SitemapWarmJourneyOptions = {
    sitemapUrl: string;
    minimumPriority: number;
    batchSize: number;
    startOffset?: number;
    allowedHosts?: string[];
    sitemapReader?: SitemapReader;
    urlLoader?: UrlLoader;
    capacity?: JourneyCapacityPolicy;
    telemetry: JourneyTelemetry;
};

export type SitemapWarmJourneyResult = {
    state: "completed" | "deferred";
    discovered: number;
    selected: number;
    warmed: number;
    selectedEntries: SitemapEntry[];
    nextOffset: number;
    retryAfterMs?: number;
    reason?: string;
};

const alwaysAvailableCapacity: JourneyCapacityPolicy = {
    async evaluate(): Promise<JourneyCapacityDecision> {
        return { available: true };
    },
};

export async function runSitemapWarmJourney(
    options: SitemapWarmJourneyOptions,
): Promise<SitemapWarmJourneyResult> {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
        throw new Error("batchSize must be a positive integer");
    }

    const startOffset = options.startOffset ?? 0;
    if (!Number.isInteger(startOffset) || startOffset < 0) {
        throw new Error("startOffset must be a non-negative integer");
    }

    const sitemapReader = options.sitemapReader ?? new SitemapReader();
    const urlLoader = options.urlLoader ?? new UrlLoader();
    const capacity = options.capacity ?? alwaysAvailableCapacity;
    const sitemapUrl = options.allowedHosts
        ? validateTargetUrl(options.sitemapUrl, options.allowedHosts)
        : options.sitemapUrl;

    await options.telemetry.observe("cache_warmer.sitemap_fetch.started", {
        "url.full": sitemapUrl,
    });

    const entries = await sitemapReader.read(sitemapUrl);

    await options.telemetry.observe("cache_warmer.sitemap_fetch.completed", {
        "cache_warmer.url.discovered": entries.length,
    });

    const selectedEntries = entries
        .filter(entry => (entry.priority ?? 0) >= options.minimumPriority)
        .map(entry => options.allowedHosts
            ? { ...entry, url: validateTargetUrl(entry.url, options.allowedHosts) }
            : entry)
        .sort((left, right) => {
            const priorityDifference = (right.priority ?? 0) - (left.priority ?? 0);
            return priorityDifference !== 0
                ? priorityDifference
                : left.url.localeCompare(right.url);
        });

    if (startOffset > selectedEntries.length) {
        throw new Error("startOffset cannot exceed selected URL count");
    }

    await options.telemetry.observe("cache_warmer.sitemap_selection.completed", {
        "cache_warmer.url.discovered": entries.length,
        "cache_warmer.url.selected": selectedEntries.length,
        "cache_warmer.minimum_priority": options.minimumPriority,
        "cache_warmer.start_offset": startOffset,
    });

    let warmed = 0;

    for (let offset = startOffset; offset < selectedEntries.length; offset += options.batchSize) {
        const decision = await capacity.evaluate();

        await options.telemetry.observe("cache_warmer.capacity.checked", {
            "cache_warmer.capacity.available": decision.available,
            "cache_warmer.next_offset": offset,
            ...(!decision.available && decision.reason
                ? { "cache_warmer.capacity.reason": decision.reason }
                : {}),
        });

        if (!decision.available) {
            await options.telemetry.observe("cache_warmer.journey.deferred", {
                "cache_warmer.next_offset": offset,
                "cache_warmer.retry_after_ms": decision.retryAfterMs,
                ...(decision.reason
                    ? { "cache_warmer.capacity.reason": decision.reason }
                    : {}),
            });

            return {
                state: "deferred",
                discovered: entries.length,
                selected: selectedEntries.length,
                warmed,
                selectedEntries,
                nextOffset: offset,
                retryAfterMs: decision.retryAfterMs,
                reason: decision.reason,
            };
        }

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
        state: "completed",
        discovered: entries.length,
        selected: selectedEntries.length,
        warmed,
        selectedEntries,
        nextOffset: selectedEntries.length,
    };
}
