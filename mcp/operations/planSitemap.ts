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
