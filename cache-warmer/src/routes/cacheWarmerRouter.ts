import express, {Application} from 'express'
import {config} from "../config";
import {TestUrlsHandler} from "../controller/test-urls-handler";
import {corsOptions} from '../lib/cors-setup'
import {
    createRouteOperationMiddleware
} from "../observability/request-operation-middleware";

export const setupCacheWarmerRoutes = (app: Application) => {
    const router = express.Router()
    router.use(corsOptions())

    const testUrlsController = new TestUrlsHandler()
    router.post(
        '/test-urls',
        createRouteOperationMiddleware('cache_warmer.test_urls'),
        testUrlsController.testUrls
    )

    app.use(config.route.cacheWarmerPrefix, router)
}
