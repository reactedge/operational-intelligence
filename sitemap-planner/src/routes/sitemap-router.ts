import express, {Application} from 'express';
import {config} from '../config';
import {PlanSitemapHandler} from '../controller/plan-sitemap-handler';
import {corsOptions} from '../lib/cors-setup';
import {createRouteOperationMiddleware} from '../observability/request-operation-middleware';

export const setupSitemapRoutes = (app: Application): void => {
    const router = express.Router();
    router.use(corsOptions());

    const handler = new PlanSitemapHandler();
    router.post(
        '/plan',
        createRouteOperationMiddleware('sitemap_planner.plan'),
        handler.plan
    );

    app.use(config.route.servicePrefix, router);
};
