export class SitemapClient {
    constructor(
        private readonly allowedHosts: string[],
        private readonly timeoutMs: number
    ) {}

    async fetch(suppliedUrl: string): Promise<{url: string; xml: string}> {
        const url = new URL(suppliedUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('The sitemap URL must use HTTP or HTTPS.');
        }
        if (!this.allowedHosts.includes(url.hostname)) {
            throw new Error(`Sitemap host is not allowed: ${url.hostname}`);
        }

        const response = await fetch(url, {
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: {'accept': 'application/xml,text/xml;q=0.9'}
        });
        if (!response.ok) {
            throw new Error(`Sitemap returned HTTP ${response.status}.`);
        }

        return {url: url.toString(), xml: await response.text()};
    }
}
