import test from "node:test";
import assert from "node:assert/strict";

import { runSitemapWorker } from "../src/worker/sitemapWorker";
import type { SitemapWarmJourneyResult } from "../src/worker/sitemapWarmJourney";

test("worker defers, sleeps, resumes from the saved offset and completes the cycle", async () => {
    const abortController = new AbortController();
    const startOffsets: number[] = [];
    const sleeps: number[] = [];
    const events: string[] = [];
    let journeyRun = 0;

    const deferred: SitemapWarmJourneyResult = {
        state: "deferred",
        discovered: 40,
        selected: 24,
        warmed: 10,
        selectedEntries: [],
        nextOffset: 10,
        retryAfterMs: 30_000,
        reason: "CPU usage 92% exceeds 85%.",
    };

    const completed: SitemapWarmJourneyResult = {
        state: "completed",
        discovered: 40,
        selected: 24,
        warmed: 14,
        selectedEntries: [],
        nextOffset: 24,
    };

    await runSitemapWorker({
        sitemapUrl: "https://example.test/sitemap.xml",
        minimumPriority: 0.5,
        batchSize: 5,
        cycleIntervalMs: 300_000,
        signal: abortController.signal,
        capacity: {
            async evaluate() {
                return { available: true };
            },
        },
        telemetry: {
            observe(name) {
                events.push(name);
            },
        },
        async runJourney(options) {
            startOffsets.push(options.startOffset ?? 0);
            journeyRun += 1;
            return journeyRun === 1 ? deferred : completed;
        },
        async sleep(ms) {
            sleeps.push(ms);
            if (ms === 300_000) {
                abortController.abort();
            }
        },
    });

    assert.deepEqual(startOffsets, [0, 10]);
    assert.deepEqual(sleeps, [30_000, 300_000]);
    assert.deepEqual(events, [
        "cache_warmer.worker.started",
        "cache_warmer.worker.deferred",
        "cache_warmer.worker.cycle.completed",
        "cache_warmer.worker.stopped",
    ]);
});
