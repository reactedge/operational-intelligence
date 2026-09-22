import express, { Application, Request, Response, NextFunction } from 'express'
import { config } from "../config";
import { corsOptions } from '../lib/cors-setup'
import { sanitiseUrl } from "../lib/url";
import { TestOneUrlHandler } from "../controller/test-one-url-handler"

export const setupOneUrlRoutes = (app: Application) => {
    const router = express.Router()
    const options = corsOptions();
    router.use(options)

    const testOneUrlController = new TestOneUrlHandler()

    router.use('/', (req: Request, res: Response, next: NextFunction) => {
        console.log(`cache warmer request: ${sanitiseUrl(req.url)}`)
        next()
    })

    router.post("/test-url", testOneUrlController.testUrl)

    app.use(config.route.validationPrefix, router)
}
