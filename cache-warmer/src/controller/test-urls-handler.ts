import {Request, Response} from "express";
import {config} from "../config";
import {validateTargetUrl} from "../lib/url";
import {BatchLoader} from "../model/performance/batch-loader";
import {PerformanceEntry} from "../model/performance/types";
import {UrlLoader} from "../model/performance/url-loader";
import {PlatformSafetyPolicy} from "../model/platform/platform-safety-policy";
import {PlatformSignalsClient} from "../model/platform/platform-signals-client";
import {OpenTelemetryObserver} from "../observability/activity";
import {Operation} from "../observability/operation";

export class TestUrlsHandler {
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
        const requestOperation = res.locals.requestOperation as Operation;
        const operation = telemetry.startChildOperation(
            requestOperation,
            'cache_warmer.test_urls'
        );

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
            const firstResult = await this.warmUrl(
                urls[0],
                1,
                telemetry,
                operation
            );
            const platformStatus = await this.platformSignals.getStatus(
                telemetry,
                operation
            );
            const decision = this.safetyPolicy.evaluate(
                firstResult,
                platformStatus
            );
            const gateOperation = telemetry.startChildOperation(
                operation,
                'cache_warmer.second_url_gate',
                {
                    'cache_warmer.gate.allowed': decision.allowed,
                    'cache_warmer.gate.reason_count': decision.reasons.length
                }
            );
            gateOperation.addEvent(
                'cache_warmer.gate.decided',
                {'cache_warmer.gate.reasons': decision.reasons}
            );
            gateOperation.succeed();

            if (!decision.allowed) {
                operation.setAttribute('cache_warmer.outcome', 'stopped');
                operation.succeed();
                res.json({
                    status: 'stopped',
                    results: [firstResult],
                    gate: decision,
                    platform: platformStatus
                });
                return;
            }

            const secondResult = await this.warmUrl(
                urls[1],
                2,
                telemetry,
                operation
            );

            operation.setAttribute('cache_warmer.outcome', 'completed');
            operation.succeed();
            res.json({
                status: 'completed',
                results: [firstResult, secondResult],
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
        if (!Array.isArray(value) || value.length !== 2) {
            throw new Error('Exactly two URLs are required.');
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

    private async warmUrl(
        url: string,
        position: number,
        telemetry: OpenTelemetryObserver,
        parentOperation: Operation
    ): Promise<PerformanceEntry> {
        const id = `url-${position}`;
        const run = await this.batchLoader.measure(
            [{id, label: `URL ${position}`, url}],
            telemetry,
            parentOperation
        );
        const result = run.get(id);

        if (!result) {
            throw new Error(`No result was produced for URL ${position}.`);
        }

        return result;
    }
}
