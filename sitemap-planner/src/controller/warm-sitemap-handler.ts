import {Request, Response} from 'express';
import {config} from '../config';
import {CacheWarmerClient} from '../model/cache-warmer/cache-warmer-client';
import {SitemapClient} from '../model/sitemap/sitemap-client';
import {SitemapPlanner} from '../model/sitemap/sitemap-planner';
import {SitemapReader} from '../model/sitemap/sitemap-reader';
import {SitemapSelector} from '../model/sitemap/sitemap-selector';
import {SitemapSelectionConfig} from '../model/sitemap/types';
import {OpenTelemetryObserver} from '../observability/activity';
import {Operation} from '../observability/operation';

export class WarmSitemapHandler {
    constructor(
        private readonly sitemapClient = new SitemapClient(
            config.sitemap.allowedHosts,
            config.sitemap.timeoutMs
        ),
        private readonly reader = new SitemapReader(),
        private readonly planner = new SitemapPlanner(),
        private readonly selector = new SitemapSelector(),
        private readonly cacheWarmer = new CacheWarmerClient(
            config.cacheWarmer.url,
            config.cacheWarmer.timeoutMs
        )
    ) {}

    warm = async (req: Request, res: Response): Promise<void> => {
        const telemetry = req.app.locals.telemetry as OpenTelemetryObserver;
        const operation = res.locals.routeOperation as Operation;
        const sitemapUrl = typeof req.body?.sitemapUrl === 'string'
            ? req.body.sitemapUrl
            : '';

        if (!sitemapUrl) {
            this.badRequest(res, operation, 'sitemapUrl is required.');
            return;
        }

        let selectionConfig: SitemapSelectionConfig;
        try {
            selectionConfig = this.readSelectionConfig(req.body?.selection);
            this.selector.select([], selectionConfig);
        } catch (error) {
            this.badRequest(
                res,
                operation,
                error instanceof Error ? error.message : 'Invalid selection.'
            );
            return;
        }

        try {
            const fetchOperation = telemetry.startChildOperation(
                operation,
                'sitemap_planner.fetch_sitemap',
                {'url.full': sitemapUrl}
            );
            let sitemap: {url: string; xml: string};
            try {
                sitemap = await this.sitemapClient.fetch(sitemapUrl);
                fetchOperation.succeed();
            } catch (error) {
                fetchOperation.fail(error);
                throw error;
            }

            const transformOperation = telemetry.startChildOperation(
                operation,
                'sitemap_planner.transform'
            );
            const planned = this.reader.parse(sitemap.xml).map(
                entry => this.planner.plan(entry)
            );
            transformOperation.setAttribute('sitemap.url.count', planned.length);
            transformOperation.succeed();

            const selectOperation = telemetry.startChildOperation(
                operation,
                'sitemap_planner.select'
            );
            const selection = this.selector.select(planned, selectionConfig);
            selectOperation.setAttribute('sitemap.url.matched', selection.matched);
            selectOperation.setAttribute(
                'sitemap.url.selected',
                selection.entries.length
            );
            selectOperation.succeed();

            if (selection.entries.length === 0) {
                operation.succeed();
                res.status(422).json({
                    error: 'No sitemap URLs matched the selection configuration.',
                    matched: 0,
                    selected: 0,
                    entries: []
                });
                return;
            }

            const cacheWarmer = await this.cacheWarmer.warm(
                selection.entries.map(entry => entry.url),
                telemetry,
                operation
            );

            operation.setAttribute('sitemap.url.selected', selection.entries.length);
            operation.succeed();
            res.json({
                sitemapUrl: sitemap.url,
                matched: selection.matched,
                selected: selection.entries.length,
                entries: selection.entries,
                cacheWarmer
            });
        } catch (error) {
            operation.fail(error);
            res.status(502).json({
                error: error instanceof Error
                    ? error.message
                    : 'Unable to delegate sitemap URLs.'
            });
        }
    };

    private readSelectionConfig(value: unknown): SitemapSelectionConfig {
        if (!value || typeof value !== 'object') {
            throw new Error('selection is required.');
        }

        const selection = value as Record<string, unknown>;
        return {
            requiredTags: selection.requiredTags as string[],
            maximumTargetResponseTimeMs:
                selection.maximumTargetResponseTimeMs as number,
            minimumPriority: selection.minimumPriority as number,
            limit: selection.limit as number
        };
    }

    private badRequest(
        res: Response,
        operation: Operation,
        message: string
    ): void {
        const error = new Error(message);
        operation.fail(error);
        res.status(400).json({error: message});
    }
}
