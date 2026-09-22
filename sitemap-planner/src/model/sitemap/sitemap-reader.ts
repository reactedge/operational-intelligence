import {XMLParser} from 'fast-xml-parser';
import {SitemapSourceEntry} from './types';

type ParsedUrl = {
    loc?: string;
    priority?: number | string;
};

export class SitemapReader {
    private readonly parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: true,
        trimValues: true
    });

    parse(xml: string): SitemapSourceEntry[] {
        const parsed = this.parser.parse(xml) as {
            urlset?: {url?: ParsedUrl | ParsedUrl[]}
        };
        const urls = parsed.urlset?.url;
        if (!urls) {
            throw new Error('The document is not a sitemap URL set.');
        }

        return (Array.isArray(urls) ? urls : [urls]).map(entry => {
            if (typeof entry.loc !== 'string' || entry.loc.length === 0) {
                throw new Error('A sitemap entry is missing its URL.');
            }
            const sitemapPriority = entry.priority === undefined
                ? undefined
                : Number(entry.priority);

            return {
                url: entry.loc,
                sitemapPriority: Number.isFinite(sitemapPriority)
                    ? sitemapPriority
                    : undefined
            };
        });
    }
}
