export type CacheWarmJob = {
    id: string;
    url: string;
    source?: "manual" | "sitemap";
};

export type CapacityDecision =
    | { available: true }
    | { available: false; retryAfterMs: number; reason?: string };

export type WarmResult = {
    statusCode: number;
    durationMs: number;
};

export type WorkerDecision =
    | { state: "deferred"; retryAfterMs: number; reason?: string }
    | { state: "idle" }
    | { state: "completed"; job: CacheWarmJob; result: WarmResult }
    | { state: "failed"; job: CacheWarmJob; error: Error };

export interface CacheWarmQueue {
    next(): Promise<CacheWarmJob | null>;
}

export interface CapacityPolicy {
    evaluate(): Promise<CapacityDecision>;
}

export interface CacheWarmer {
    warm(job: CacheWarmJob): Promise<WarmResult>;
}

export interface CacheWarmTelemetry {
    deferred(decision: Extract<WorkerDecision, { state: "deferred" }>): void | Promise<void>;
    idle(): void | Promise<void>;
    started(job: CacheWarmJob): void | Promise<void>;
    completed(job: CacheWarmJob, result: WarmResult): void | Promise<void>;
    failed(job: CacheWarmJob, error: Error): void | Promise<void>;
}

export type WorkerDependencies = {
    queue: CacheWarmQueue;
    capacity: CapacityPolicy;
    warmer: CacheWarmer;
    telemetry: CacheWarmTelemetry;
};

export async function runWorkerIteration(
    dependencies: WorkerDependencies,
): Promise<WorkerDecision> {
    const capacity = await dependencies.capacity.evaluate();

    if (!capacity.available) {
        const decision: WorkerDecision = {
            state: "deferred",
            retryAfterMs: capacity.retryAfterMs,
            reason: capacity.reason,
        };

        await dependencies.telemetry.deferred(decision);
        return decision;
    }

    const job = await dependencies.queue.next();

    if (!job) {
        await dependencies.telemetry.idle();
        return { state: "idle" };
    }

    await dependencies.telemetry.started(job);

    try {
        const result = await dependencies.warmer.warm(job);
        await dependencies.telemetry.completed(job, result);

        return {
            state: "completed",
            job,
            result,
        };
    } catch (error) {
        const normalizedError = error instanceof Error
            ? error
            : new Error(String(error));

        await dependencies.telemetry.failed(job, normalizedError);

        return {
            state: "failed",
            job,
            error: normalizedError,
        };
    }
}
