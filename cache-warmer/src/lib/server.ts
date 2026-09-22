import express, { Application } from 'express'
import { config } from "../config";
import { initialiseApp } from "./initilisers";
import { OpenTelemetryObserver } from "../observability/activity";

export const startServer = async () => {
    const app: Application = express()
    const port = config.port

    await initialiseApp(app)
    const telemetry = app.locals.telemetry as OpenTelemetryObserver;
    const server = app.listen(port);

    server.once('listening', () => {
        telemetry.logObservation(
            'cache_warmer.server.started',
            {'server.port': port}
        );
    });

    server.once('error', (error: Error) => {
        const operation = telemetry.startOperation(
            'cache_warmer.server.failed',
            {'server.port': port}
        );
        operation.fail(error);
    });
}
