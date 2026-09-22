import { Request, Response } from "express";
import { OpenTelemetryObserver } from "../observability/activity"

export class TestOneUrlHandler {
    testUrl = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;

        try {
            telemetry.startOperation('cache_warmer.test_url', req.headers);

            res.json({});

        } catch (e) {
            res.status(500).json({
                healthy: false,
                error: e instanceof Error ? e.message : 'Unknown error'
            });
            telemetry.failOperation(e);
        }
    }
}
