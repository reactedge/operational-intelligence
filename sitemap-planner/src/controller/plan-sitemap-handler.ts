import {Request, Response} from 'express';
import {config} from '../config';
import {SitemapClient} from '../model/sitemap/sitemap-client';
import {SitemapPlanner} from '../model/sitemap/sitemap-planner';
import {SitemapReader} from '../model/sitemap/sitemap-reader';
import {OpenTelemetryObserver} from '../observability/activity';
import {Operation} from '../observability/operation';

export class PlanSitemapHandler {
    constructor(
        private readonly client = new SitemapClient(
            config.sitemap.allowedHosts,
            config.sitemap.timeoutMs
        ),
        private readonly reader = new SitemapReader(),
        private readonly planner = new SitemapPlanner()
    ) {}

    plan = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const operation = res.locals.routeOperation as Operation;
        const suppliedUrl = typeof req.body?.sitemapUrl === 'string'
            ? req.body.sitemapUrl
            : '';

        if (!suppliedUrl) {
            const error = new Error('sitemapUrl is required.');
            operation.fail(error);
            res.status(400).json({error: error.message});
            return;
        }

        try {
            const fetchOperation = telemetry.startChildOperation(
                operation,
                'sitemap_planner.fetch_sitemap',
                {'url.full': suppliedUrl}
            );
            let sitemap: {url: string; xml: string};
            try {
                sitemap = await this.client.fetch(suppliedUrl);
                fetchOperation.succeed();
            } catch (error) {
                fetchOperation.fail(error);
                throw error;
            }

            const transformOperation = telemetry.startChildOperation(
                operation,
                'sitemap_planner.transform'
            );
            const entries = this.reader.parse(sitemap.xml).map(
                entry => this.planner.plan(entry)
            );
            transformOperation.setAttribute('sitemap.url.count', entries.length);
            transformOperation.succeed();

            operation.setAttribute('sitemap.url.count', entries.length);
            operation.succeed();
            res.json({
                sitemapUrl: sitemap.url,
                count: entries.length,
                entries
            });
        } catch (error) {
            operation.fail(error);
            res.status(502).json({
                error: error instanceof Error ? error.message : 'Unable to plan sitemap.'
            });
        }
    };
}
