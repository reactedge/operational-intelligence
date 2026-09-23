import {
    runSitemapWarmJourney,
    type JourneyCapacityPolicy,
    type JourneyTelemetry,
    type SitemapWarmJourneyResult,
} from "./sitemapWarmJourney";

export type SitemapWorkerOptions = {
    sitemapUrl: string;
    minimumPriority: number;
    batchSize: number;
    capacity: JourneyCapacityPolicy;
    telemetry: JourneyTelemetry;
    cycleIntervalMs: number;
    allowedHosts?: string[];
    signal?: AbortSignal;
    sleep?: (ms: number) => Promise<void>;
    runJourney?: typeof runSitemapWarmJourney;
};

const defaultSleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

export async function runSitemapWorker(
    options: SitemapWorkerOptions,
): Promise<void> {
    const sleep = options.sleep ?? defaultSleep;
    const runJourney = options.runJourney ?? runSitemapWarmJourney;
    let startOffset = 0;

    await options.telemetry.observe("cache_warmer.worker.started", {
        "cache_warmer.batch_size": options.batchSize,
        "cache_warmer.minimum_priority": options.minimumPriority,
    });

    while (!options.signal?.aborted) {
        let result: SitemapWarmJourneyResult;

        try {
            result = await runJourney({
                sitemapUrl: options.sitemapUrl,
                minimumPriority: options.minimumPriority,
                batchSize: options.batchSize,
                startOffset,
                allowedHosts: options.allowedHosts,
                capacity: options.capacity,
                telemetry: options.telemetry,
            });
        } catch (error) {
            await options.telemetry.observe("cache_warmer.worker.failed", {
                "cache_warmer.start_offset": startOffset,
                "error.message": error instanceof Error ? error.message : String(error),
            });
            throw error;
        }

        if (result.state === "deferred") {
            startOffset = result.nextOffset;

            await options.telemetry.observe("cache_warmer.worker.deferred", {
                "cache_warmer.next_offset": startOffset,
                "cache_warmer.retry_after_ms": result.retryAfterMs ?? 0,
                ...(result.reason
                    ? { "cache_warmer.capacity.reason": result.reason }
                    : {}),
            });

            await sleep(result.retryAfterMs ?? 0);
            continue;
        }

        startOffset = 0;

        await options.telemetry.observe("cache_warmer.worker.cycle.completed", {
            "cache_warmer.url.discovered": result.discovered,
            "cache_warmer.url.selected": result.selected,
            "cache_warmer.url.warmed": result.warmed,
        });

        await sleep(options.cycleIntervalMs);
    }

    await options.telemetry.observe("cache_warmer.worker.stopped");
}
