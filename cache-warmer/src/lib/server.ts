import express, { Application } from 'express'
import { config } from "../config";
import { initialiseApp } from "./initilisers";
import { OpenTelemetryObserver } from "../observability/activity";
import { runSitemapWorker } from "../worker/sitemapWorker";
import { PlatformCapacityPolicy } from "../worker/platformCapacityPolicy";

export const startServer = async () => {
    const app: Application = express()
    const port = config.port

    await initialiseApp(app)
    const telemetry = app.locals.telemetry as OpenTelemetryObserver;

    try {
        await new Promise<void>((resolve, reject) => {
            const server = app.listen(port, (error?: Error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
            server.once('error', reject);
        });

        if (config.cacheWarmer.worker.enabled) {
            const abortController = new AbortController();
            const stopWorker = () => abortController.abort();

            process.once('SIGINT', stopWorker);
            process.once('SIGTERM', stopWorker);

            const capacity = new PlatformCapacityPolicy({
                statusUrl: config.platformSignals.statusUrl,
                timeoutMs: config.platformSignals.timeoutMs,
                retryAfterMs: config.cacheWarmer.worker.deferRetryMs,
                thresholds: {
                    maxCpuPercent: config.platformSignals.maxCpuPercent,
                    maxMemoryPercent: config.platformSignals.maxMemoryPercent,
                    maxDiskPercent: config.platformSignals.maxDiskPercent,
                },
            });

            void runSitemapWorker({
                sitemapUrl: config.cacheWarmer.worker.sitemapUrl,
                minimumPriority: config.cacheWarmer.worker.minimumPriority,
                batchSize: config.cacheWarmer.worker.batchSize,
                cycleIntervalMs: config.cacheWarmer.worker.cycleIntervalMs,
                capacity,
                signal: abortController.signal,
                telemetry: {
                    observe(name, attributes = {}) {
                        telemetry.logObservation(name, attributes);
                    },
                },
            }).catch(error => {
                telemetry.logObservation('cache_warmer.worker.terminated', {
                    'error.message': error instanceof Error
                        ? error.message
                        : String(error),
                });
            });
        }
    } catch (error) {
        const operation = telemetry.startOperation(
            'cache_warmer.server.failed',
            {'server.port': port}
        );
        operation.fail(error);
    }
}
