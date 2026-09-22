import { Request, Response } from "express";
import { OpenTelemetryObserver } from "../observability/activity"

export class FirstHandler {
    test = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;

        try {
            telemetry.startOperation('health.validate_features', req.headers);

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