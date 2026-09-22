import {SitemapEntry, PerformanceEntry} from "./types";
import {UrlLoader} from "./url-loader";
import {OpenTelemetryObserver} from "../../observability/activity";
import {Operation} from "../../observability/operation";

export class BatchLoader {
    constructor(
        private readonly urlLoader: UrlLoader
    ) {}

    async measure(
        entries: SitemapEntry[],
        telemetry: OpenTelemetryObserver,
        parentOperation: Operation
    ): Promise<PerformanceRun> {
        const run = new PerformanceRun();

        for (const entry of entries) {
            run.add(
                await this.loadUrl(
                    entry,
                    telemetry,
                    parentOperation
                )
            );
        }

        return run;
    }

    async loadUrl(
        entry: SitemapEntry,
        telemetry: OpenTelemetryObserver,
        parentOperation: Operation
    ): Promise<PerformanceEntry> {
        const loadOperation = telemetry.startChildOperation(
            parentOperation,
            'cache_warmer.load_url',
            {
                'cache_warmer.page.id': entry.id,
                'cache_warmer.page.label': entry.label,
                'url.full': entry.url
            }
        );

        const result = await this.urlLoader.fetchText(entry.url);

        loadOperation.setAttribute('cache_warmer.healthy', result.healthy);
        loadOperation.setAttribute('cache_warmer.duration.ms', result.durationMs);

        if (result.status !== undefined) {
            loadOperation.setAttribute('http.response.status_code', result.status);
        }

        if (result.cacheStatus !== undefined) {
            loadOperation.setAttribute(
                'cache_warmer.cache.status',
                result.cacheStatus
            );
        }

        loadOperation.setAttribute(
            'cache_warmer.cache.hit',
            result.cacheHit ?? false
        );

        if (result.healthy) {
            loadOperation.succeed();
        } else {
            loadOperation.fail(
                new Error(
                    result.error
                    ?? `Target returned HTTP ${result.status ?? 'unknown'}`
                )
            );
        }

        return {
            id: entry.id,
            label: entry.label,
            url: entry.url,
            status: result.status,
            durationMs: result.durationMs,
            healthy: result.healthy,
            cacheStatus: result.cacheStatus,
            cacheHit: result.cacheHit,
            error: result.error
        };
    }
}

export class PerformanceRun {
    private readonly entries = new Map<string, PerformanceEntry>();

    add(entry: PerformanceEntry): void {
        this.entries.set(entry.id, entry);
    }

    getEntries(): PerformanceEntry[] {
        return [...this.entries.values()];
    }

    get(id: string): PerformanceEntry | undefined {
        return this.entries.get(id);
    }
}
