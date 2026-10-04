import type {McpServer} from '@modelcontextprotocol/server';
import {PlanSitemapInputSchema} from '../operations/planSitemap.js';
import {handlePlanSitemap} from '../handlers/planSitemap.js';

export function registerPlanSitemapTool(server: McpServer): void {
    server.registerTool(
        'plan_sitemap',
        {
            title: 'Read a sitemap and select candidate URLs',
            description: 'Fetch a sitemap URL set and select candidates using the existing sitemap-planner policy. Does not fetch candidate pages or warm caches. Response-time values are policy targets, not measured performance.',
            inputSchema: PlanSitemapInputSchema,
            annotations: {readOnlyHint: true, openWorldHint: true}
        },
        handlePlanSitemap
    );
}
