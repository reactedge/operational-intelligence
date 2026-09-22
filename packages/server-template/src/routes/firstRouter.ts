import express, { Application, Request, Response, NextFunction } from 'express'
import { config } from "../config";
import { corsOptions } from '../lib/cors-setup'
import { sanitiseUrl } from "../lib/url";
import { FirstHandler } from "../controller/first-handler"

export const setupFirstRoutes = (app: Application) => {
    const router = express.Router()
    const options = corsOptions();
    router.use(options)

    const FirstController = new FirstHandler()

    router.use('/', (req: Request, res: Response, next: NextFunction) => {
        console.log(`health validation request: ${sanitiseUrl(req.url)}`)
        next()
    })

    router.post("/test", FirstController.test)

    app.use(config.route.firstPrefix, router)
}