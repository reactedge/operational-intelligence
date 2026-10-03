import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {config} from '../../sitemap-planner/src/config.js';
import {SitemapClient} from '../../sitemap-planner/src/model/sitemap/sitemap-client.js';
import {SitemapReader} from '../../sitemap-planner/src/model/sitemap/sitemap-reader.js';
import {SitemapPlanner} from '../../sitemap-planner/src/model/sitemap/sitemap-planner.js';
import {SitemapSelector} from '../../sitemap-planner/src/model/sitemap/sitemap-selector.js';

// Domain validation and selection limits remain owned by SitemapSelector.
export const PlanSitemapInputSchema = z.object({
    sitemapUrl: z.string(),
    selection: z.object({
        requiredTags: z.array(z.string()),
        maximumTargetResponseTimeMs: z.number(),
        minimumPriority: z.number(),
        limit: z.number()
    })
});

export async function planSitemap(
    input: z.infer<typeof PlanSitemapInputSchema>,
    client = new SitemapClient(config.sitemap.allowedHosts, config.sitemap.timeoutMs)
) {
    const selector = new SitemapSelector();
    // Reject invalid selection before making a network request.
    selector.select([], input.selection);
    const sitemap = await client.fetch(input.sitemapUrl);
    const reader = new SitemapReader();
    const planner = new SitemapPlanner();
    const planned = reader.parse(sitemap.xml).map(entry => planner.plan(entry));
    const selection = selector.select(planned, input.selection);

    return {
        sitemapUrl: sitemap.url,
        count: planned.length,
        matched: selection.matched,
        selected: selection.entries.length,
        entries: selection.entries
    };
}

export function registerPlanSitemapTool(server: McpServer): void {
    server.registerTool(
        'plan_sitemap',
        {
            title: 'Read a sitemap and select candidate URLs',
            description: 'Fetch a sitemap URL set and select candidates using the existing sitemap-planner policy. Does not fetch candidate pages or warm caches. Response-time values are policy targets, not measured performance.',
            inputSchema: PlanSitemapInputSchema,
            annotations: {readOnlyHint: true, openWorldHint: true}
        },
        async input => {
            try {
                const result = await planSitemap(input);
                return {
                    content: [{type: 'text', text: JSON.stringify(result)}],
                    structuredContent: result
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{
                        type: 'text',
                        text: error instanceof Error ? error.message : String(error)
                    }]
                };
            }
        }
    );
}
