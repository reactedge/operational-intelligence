import {Request, Response} from "express";
import {config} from "../config";
import {validateTargetUrl} from "../lib/url";
import {BatchLoader} from "../model/performance/batch-loader";
import {UrlLoader} from "../model/performance/url-loader";
import {PlatformSafetyPolicy} from "../model/platform/platform-safety-policy";
import {PlatformSignalsClient} from "../model/platform/platform-signals-client";
import {OpenTelemetryObserver} from "../observability/activity";
import {Operation} from "../observability/operation";

export class TestUrlsHandler {
    private static readonly MAX_BATCH_SIZE = 10;

    constructor(
        private readonly batchLoader = new BatchLoader(new UrlLoader()),
        private readonly platformSignals = new PlatformSignalsClient(
            config.platformSignals.statusUrl,
            config.platformSignals.timeoutMs
        ),
        private readonly safetyPolicy = new PlatformSafetyPolicy({
            maxCpuPercent: config.platformSignals.maxCpuPercent,
            maxMemoryPercent: config.platformSignals.maxMemoryPercent,
            maxDiskPercent: config.platformSignals.maxDiskPercent
        })
    ) {}

    testUrls = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const operation = res.locals.routeOperation as Operation;

        let urls: string[];

        try {
            urls = this.validateUrls(req.body?.urls);
            operation.setAttribute('cache_warmer.url.count', urls.length);
        } catch (error) {
            operation.fail(error);
            res.status(400).json({
                error: error instanceof Error
                    ? error.message
                    : 'Invalid URLs.'
            });
            return;
        }

        try {
            const run = await this.batchLoader.measure(
                urls.map((url, index) => ({
                    id: `url-${index + 1}`,
                    label: `URL ${index + 1}`,
                    url
                })),
                telemetry,
                operation
            );
            const results = run.getEntries();
            const platformStatus = await this.platformSignals.getStatus(
                telemetry,
                operation
            );
            const decision = this.safetyPolicy.evaluate(
                results,
                platformStatus
            );
            const gateOperation = telemetry.startChildOperation(
                operation,
                'cache_warmer.next_batch_gate',
                {
                    'cache_warmer.batch.url_count': results.length,
                    'cache_warmer.gate.allowed': decision.allowed,
                    'cache_warmer.gate.reason_count': decision.reasons.length
                }
            );
            gateOperation.addEvent(
                'cache_warmer.gate.decided',
                {'cache_warmer.gate.reasons': decision.reasons}
            );
            gateOperation.succeed();

            operation.setAttribute('cache_warmer.outcome', 'completed');
            operation.setAttribute(
                'cache_warmer.next_batch.allowed',
                decision.allowed
            );
            operation.succeed();
            res.json({
                status: 'completed',
                results,
                gate: decision,
                platform: platformStatus
            });
        } catch (error) {
            operation.fail(error);
            res.status(502).json({
                error: error instanceof Error
                    ? error.message
                    : 'Operational dependency failed.'
            });
        }
    }

    private validateUrls(value: unknown): string[] {
        if (
            !Array.isArray(value)
            || value.length < 1
            || value.length > TestUrlsHandler.MAX_BATCH_SIZE
        ) {
            throw new Error(
                `Batch size must be between 1 and ${TestUrlsHandler.MAX_BATCH_SIZE} URLs.`
            );
        }

        return value.map(url => {
            if (typeof url !== 'string' || url.length === 0) {
                throw new Error('Each URL must be a non-empty string.');
            }

            return validateTargetUrl(
                url,
                config.cacheWarmer.allowedHosts
            );
        });
    }

}
