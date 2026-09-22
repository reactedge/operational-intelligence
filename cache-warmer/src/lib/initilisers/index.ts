import routes from "../../routes/index.js";
import access from "../../access/index"
import { Application } from "express";
import { setupTelemetry } from "../../observability/tracing";
import {createRequestOperationMiddleware} from "../../observability/request-operation-middleware";

export const initialiseApp = async (app: Application) => {
    setupTelemetry(app)
    app.use(
        createRequestOperationMiddleware('cache_warmer.request')
    )
    access(app)
    routes(app)
}
