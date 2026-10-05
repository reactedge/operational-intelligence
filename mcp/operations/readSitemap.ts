import {z} from 'zod';
import {config} from '../../sitemap-planner/src/config.js';
import {SitemapClient} from '../../sitemap-planner/src/model/sitemap/sitemap-client.js';
import {SitemapReader} from '../../sitemap-planner/src/model/sitemap/sitemap-reader.js';

export const ReadSitemapInputSchema = z.object({sitemapUrl: z.string()});

export async function readSitemap(
    input: z.infer<typeof ReadSitemapInputSchema>,
    client = new SitemapClient(config.sitemap.allowedHosts, config.sitemap.timeoutMs)
) {
    const {sitemapUrl} = ReadSitemapInputSchema.parse(input);
    const sitemap = await client.fetch(sitemapUrl);
    const entries = new SitemapReader().parse(sitemap.xml);
    return {sitemapUrl: sitemap.url, count: entries.length, entries};
}
