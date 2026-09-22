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
    private static readonly MAX_URLS = 10;

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
            const results: PerformanceEntry[] = [];
            const gates: Array<{
                afterUrl: number;
                decision: ReturnType<PlatformSafetyPolicy['evaluate']>;
                platform: Awaited<ReturnType<PlatformSignalsClient['getStatus']>>;
            }> = [];

            for (let index = 0; index < urls.length; index += 1) {
                const result = await this.warmUrl(
                    urls[index],
                    index + 1,
                    telemetry,
                    operation
                );
                results.push(result);

                if (index === urls.length - 1) {
                    break;
                }

                const platformStatus = await this.platformSignals.getStatus(
                    telemetry,
                    operation
                );
                const decision = this.safetyPolicy.evaluate(
                    result,
                    platformStatus
                );
                const gateOperation = telemetry.startChildOperation(
                    operation,
                    'cache_warmer.next_url_gate',
                    {
                        'cache_warmer.gate.after_url': index + 1,
                        'cache_warmer.gate.allowed': decision.allowed,
                        'cache_warmer.gate.reason_count': decision.reasons.length
                    }
                );
                gateOperation.addEvent(
                    'cache_warmer.gate.decided',
                    {'cache_warmer.gate.reasons': decision.reasons}
                );
                gateOperation.succeed();
                gates.push({
                    afterUrl: index + 1,
                    decision,
                    platform: platformStatus
                });

                if (!decision.allowed) {
                    operation.setAttribute('cache_warmer.outcome', 'stopped');
                    operation.succeed();
                    res.json({
                        status: 'stopped',
                        results,
                        gate: decision,
                        platform: platformStatus,
                        gates
                    });
                    return;
                }
            }

            operation.setAttribute('cache_warmer.outcome', 'completed');
            operation.succeed();
            const lastGate = gates.at(-1);
            res.json({
                status: 'completed',
                results,
                gate: lastGate?.decision,
                platform: lastGate?.platform,
                gates
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
            || value.length > TestUrlsHandler.MAX_URLS
        ) {
            throw new Error(
                `Between 1 and ${TestUrlsHandler.MAX_URLS} URLs are required.`
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
