import {NextFunction, Request, RequestHandler, Response} from "express";
import {sanitiseUrl} from "../lib/url";
import {OpenTelemetryObserver} from "./activity";

export const createRequestOperationMiddleware = (
    operationName: string
): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const requestOperation = telemetry.startOperation(
            operationName,
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

        next();
    };
};
