import express, {Application} from 'express'
import {config} from "../config";
import {TestUrlsHandler} from "../controller/test-urls-handler";
import {corsOptions} from '../lib/cors-setup'

export const setupCacheWarmerRoutes = (app: Application) => {
    const router = express.Router()
    router.use(corsOptions())

    const testUrlsController = new TestUrlsHandler()
    router.post('/test-urls', testUrlsController.testUrls)

    app.use(config.route.cacheWarmerPrefix, router)
}
