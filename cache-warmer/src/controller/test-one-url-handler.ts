import { Request, Response } from "express";
import { OpenTelemetryObserver } from "../observability/activity"
import { Operation } from "../observability/operation";
import { normalizeUrl } from "../lib/url";

export class TestOneUrlHandler {
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

        try {
            if (suppliedUrl.length === 0) {
                throw new Error('A URL is required.');
            }

            const targetUrl = normalizeUrl(suppliedUrl);
            testOperation.setAttribute(
                'cache_warmer.target.url',
                targetUrl
            );

            testOperation.succeed();
            res.json({});

        } catch (e) {
            testOperation.fail(e);
            res.status(400).json({
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }
}
