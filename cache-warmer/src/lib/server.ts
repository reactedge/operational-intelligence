import express, { Application } from 'express'
import { config } from "../config";
import { initialiseApp } from "./initilisers";
import { ErrorWrapper } from "../error-handler";
import { logger } from "../logger";

export const startServer = async () => {
    const app: Application = express()
    const port = config.port
    const errorWrapper = new ErrorWrapper()

    await initialiseApp(app)

    try {
        app.listen(port, () => {
            logger.info('cache_warmer.server.started', { port })
        })
    } catch (error: unknown) {
        errorWrapper.handle(error)
    }
}
