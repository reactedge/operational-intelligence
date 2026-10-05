import {z} from 'zod';
import {SitemapPlanner} from '../../sitemap-planner/src/model/sitemap/sitemap-planner.js';
import {SitemapSelector} from '../../sitemap-planner/src/model/sitemap/sitemap-selector.js';

export const SelectUrlsInputSchema = z.object({
    entries: z.array(z.object({
        url: z.url({protocol: /^https?$/}),
        sitemapPriority: z.number().optional()
    })),
    selection: z.object({
        requiredTags: z.array(z.string()),
        maximumTargetResponseTimeMs: z.number(),
        minimumPriority: z.number(),
        limit: z.number()
    })
});

export function selectUrls(input: z.infer<typeof SelectUrlsInputSchema>) {
    const {entries, selection} = SelectUrlsInputSchema.parse(input);
    const selector = new SitemapSelector();
    // Domain policy and limits remain owned by the existing selector.
    selector.select([], selection);
    const planner = new SitemapPlanner();
    const planned = entries.map(entry => planner.plan(entry));
    const selected = selector.select(planned, selection);
    return {
        count: entries.length,
        matched: selected.matched,
        selected: selected.entries.length,
        entries: selected.entries
    };
}
