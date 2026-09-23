import test from "node:test";
import assert from "node:assert/strict";

import {
    runWorkerIteration,
    type CacheWarmJob,
    type CacheWarmTelemetry,
    type WorkerDependencies,
} from "../src/worker/cacheWarmWorker.js";

const job: CacheWarmJob = {
    id: "job-1",
    url: "https://example.test/product.html",
    source: "sitemap",
};

function createTelemetryRecorder() {
    const events: string[] = [];

    const telemetry: CacheWarmTelemetry = {
        deferred: async () => { events.push("deferred"); },
        idle: async () => { events.push("idle"); },
        started: async () => { events.push("started"); },
        completed: async () => { events.push("completed"); },
        failed: async () => { events.push("failed"); },
    };

    return { telemetry, events };
}

test("does not consume a job when the platform is saturated", async () => {
    let queueReads = 0;
    let warmCalls = 0;
    const { telemetry, events } = createTelemetryRecorder();

    const dependencies: WorkerDependencies = {
        capacity: {
            evaluate: async () => ({
                available: false,
                retryAfterMs: 5_000,
                reason: "platform-saturated",
            }),
        },
        queue: {
            next: async () => {
                queueReads += 1;
                return job;
            },
        },
        warmer: {
            warm: async () => {
                warmCalls += 1;
                return { statusCode: 200, durationMs: 50 };
            },
        },
        telemetry,
    };

    const result = await runWorkerIteration(dependencies);

    assert.deepEqual(result, {
        state: "deferred",
        retryAfterMs: 5_000,
        reason: "platform-saturated",
    });
    assert.equal(queueReads, 0);
    assert.equal(warmCalls, 0);
    assert.deepEqual(events, ["deferred"]);
});

test("idles when capacity is available but the queue is empty", async () => {
    let warmCalls = 0;
    const { telemetry, events } = createTelemetryRecorder();

    const result = await runWorkerIteration({
        capacity: { evaluate: async () => ({ available: true }) },
        queue: { next: async () => null },
        warmer: {
            warm: async () => {
                warmCalls += 1;
                return { statusCode: 200, durationMs: 50 };
            },
        },
        telemetry,
    });

    assert.deepEqual(result, { state: "idle" });
    assert.equal(warmCalls, 0);
    assert.deepEqual(events, ["idle"]);
});

test("warms one queued URL when capacity is available", async () => {
    const { telemetry, events } = createTelemetryRecorder();
    const warmed: CacheWarmJob[] = [];

    const result = await runWorkerIteration({
        capacity: { evaluate: async () => ({ available: true }) },
        queue: { next: async () => job },
        warmer: {
            warm: async currentJob => {
                warmed.push(currentJob);
                return { statusCode: 200, durationMs: 42 };
            },
        },
        telemetry,
    });

    assert.deepEqual(warmed, [job]);
    assert.deepEqual(result, {
        state: "completed",
        job,
        result: { statusCode: 200, durationMs: 42 },
    });
    assert.deepEqual(events, ["started", "completed"]);
});

test("records a failed warming attempt without crashing the worker iteration", async () => {
    const { telemetry, events } = createTelemetryRecorder();
    const failure = new Error("upstream unavailable");

    const result = await runWorkerIteration({
        capacity: { evaluate: async () => ({ available: true }) },
        queue: { next: async () => job },
        warmer: { warm: async () => { throw failure; } },
        telemetry,
    });

    assert.equal(result.state, "failed");
    assert.equal(result.job, job);
    assert.equal(result.error, failure);
    assert.deepEqual(events, ["started", "failed"]);
});
