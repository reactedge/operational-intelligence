import express, { Application, Request, Response, NextFunction } from 'express'
import { config } from "../config";
import { corsOptions } from '../lib/cors-setup'
import { sanitiseUrl } from "../lib/url";
import { TestOneUrlHandler } from "../controller/test-one-url-handler"
import { OpenTelemetryObserver } from "../observability/activity";
import { Operation } from "../observability/operation";

export const setupOneUrlRoutes = (app: Application) => {
    const router = express.Router()
    const options = corsOptions();
    router.use(options)

    const testOneUrlController = new TestOneUrlHandler()

    router.use('/', (req: Request, res: Response, next: NextFunction) => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const requestOperation = telemetry.startOperation(
            'cache_warmer.request',
            {
                'http.request.method': req.method,
                'url.path': sanitiseUrl(req.originalUrl)
            }
        );

        // res.locals can resemble shared application state, but Express creates
        // it for this response only. Concurrent requests therefore retain their
        // own parent operation and cannot overwrite one another's trace state.
        res.locals.requestOperation = requestOperation;

        res.once('finish', () => {
            requestOperation.complete(res.statusCode);
        });

        res.once('close', () => {
            requestOperation.fail(
                new Error('Response closed before completion.')
            );
        });
        next()
    })

    router.post("/test-url", testOneUrlController.testUrl)

    app.use(config.route.cacheWarmerPrefix, router)
}
