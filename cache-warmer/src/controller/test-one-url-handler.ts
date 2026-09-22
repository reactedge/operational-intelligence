import { Request, Response } from "express";
import { OpenTelemetryObserver } from "../observability/activity"
import { Operation } from "../observability/operation";
import { validateTargetUrl } from "../lib/url";
import {config} from "../config";
import {BatchLoader} from "../model/performance/batch-loader";
import {UrlLoader} from "../model/performance/url-loader";

export class TestOneUrlHandler {
    constructor(
        private readonly batchLoader = new BatchLoader(new UrlLoader())
    ) {}

    testUrl = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const requestOperation = res.locals.requestOperation as Operation;
        const suppliedUrl = typeof req.body?.url === 'string'
            ? req.body.url
            : '';
        const testOperation = telemetry.startChildOperation(
            requestOperation,
            'cache_warmer.test_url',
            suppliedUrl.length > 0
                ? {'cache_warmer.target.url': suppliedUrl}
                : {}
        );

        let targetUrl: string;

        try {
            if (suppliedUrl.length === 0) {
                throw new Error('A URL is required.');
            }

            targetUrl = validateTargetUrl(
                suppliedUrl,
                config.cacheWarmer.allowedHosts
            );
            testOperation.setAttribute(
                'cache_warmer.target.url',
                targetUrl
            );
        } catch (e) {
            testOperation.fail(e);
            res.status(400).json({
                error: e instanceof Error ? e.message : 'Unknown error'
            });
            return;
        }

        try {
            const run = await this.batchLoader.measure(
                [{
                    id: 'requested-url',
                    label: 'Requested URL',
                    url: targetUrl
                }],
                telemetry,
                testOperation
            );
            const result = run.get('requested-url');

            if (!result) {
                throw new Error('The cache-warmer produced no result.');
            }

            if (!result.healthy) {
                const error = new Error(
                    result.error
                    ?? `Target returned HTTP ${result.status ?? 'unknown'}`
                );
                testOperation.fail(error);
                res.status(502).json({
                    ...result,
                    error: error.message
                });
                return;
            }

            testOperation.setAttribute(
                'cache_warmer.cache.hit',
                result.cacheHit ?? false
            );
            testOperation.succeed();
            res.json(result);
        } catch (e) {
            testOperation.fail(e);
            res.status(500).json({
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }
}
