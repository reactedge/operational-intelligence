import { Request, Response } from "express";
import { OpenTelemetryObserver } from "../observability/activity"
import { Operation } from "../observability/operation";
import { normalizeUrl } from "../lib/url";

export class TestOneUrlHandler {
    testUrl = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const requestOperation = res.locals.requestOperation as Operation;
        let testOperation: Operation | undefined;

        try {
            if (typeof req.body?.url !== 'string' || req.body.url.length === 0) {
                res.status(400).json({
                    error: 'A URL is required.'
                });
                return;
            }

            const targetUrl = normalizeUrl(req.body.url);
            testOperation = telemetry.startChildOperation(
                requestOperation,
                'cache_warmer.test_url',
                {
                    'cache_warmer.target.url': targetUrl
                }
            );

            res.json({});
            testOperation.end();

        } catch (e) {
            res.status(500).json({
                healthy: false,
                error: e instanceof Error ? e.message : 'Unknown error'
            });
            testOperation?.fail(e);
        }
    }
}
