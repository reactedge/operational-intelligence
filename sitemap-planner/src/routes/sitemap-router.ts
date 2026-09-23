import express, {Application} from 'express';
import {config} from '../config';
import {PlanSitemapHandler} from '../controller/plan-sitemap-handler';
import {DevWarmSitemapHandler} from '../controller/warm-sitemap-handler';
import {corsOptions} from '../lib/cors-setup';
import {createRouteOperationMiddleware} from '../observability/request-operation-middleware';

export const setupSitemapRoutes = (app: Application): void => {
    const router = express.Router();
    router.use(corsOptions());

    const handler = new PlanSitemapHandler();
    const devWarmHandler = new DevWarmSitemapHandler();
    router.post(
        '/plan',
        createRouteOperationMiddleware('sitemap_planner.plan'),
        handler.plan
    );
    // Development-only integration endpoint. It replans on every request and
    // must not be used by the future persistent background worker.
    router.post(
        '/dev-warm',
        createRouteOperationMiddleware('sitemap_planner.dev_warm'),
        devWarmHandler.devWarm
    );

    app.use(config.route.servicePrefix, router);
};
