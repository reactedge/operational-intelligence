import express, {Application} from 'express';
import {config} from '../config';
import {PlanSitemapHandler} from '../controller/plan-sitemap-handler';
import {WarmSitemapHandler} from '../controller/warm-sitemap-handler';
import {corsOptions} from '../lib/cors-setup';
import {createRouteOperationMiddleware} from '../observability/request-operation-middleware';

export const setupSitemapRoutes = (app: Application): void => {
    const router = express.Router();
    router.use(corsOptions());

    const handler = new PlanSitemapHandler();
    const warmHandler = new WarmSitemapHandler();
    router.post(
        '/plan',
        createRouteOperationMiddleware('sitemap_planner.plan'),
        handler.plan
    );
    router.post(
        '/warm',
        createRouteOperationMiddleware('sitemap_planner.warm'),
        warmHandler.warm
    );

    app.use(config.route.servicePrefix, router);
};
