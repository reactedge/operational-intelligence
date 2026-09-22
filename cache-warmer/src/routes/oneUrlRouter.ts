import express, { Application } from 'express'
import { config } from "../config";
import { corsOptions } from '../lib/cors-setup'
import { TestOneUrlHandler } from "../controller/test-one-url-handler"

export const setupOneUrlRoutes = (app: Application) => {
    const router = express.Router()
    const options = corsOptions();
    router.use(options)

    const testOneUrlController = new TestOneUrlHandler()

    router.post("/test-url", testOneUrlController.testUrl)

    app.use(config.route.cacheWarmerPrefix, router)
}
