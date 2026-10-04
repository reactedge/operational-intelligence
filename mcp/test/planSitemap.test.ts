import assert from 'node:assert/strict';
import test from 'node:test';
import type {McpServer} from '@modelcontextprotocol/server';
import {SitemapClient} from '../../sitemap-planner/src/model/sitemap/sitemap-client.js';
import {registerPlanSitemapTool} from '../tools/planSitemap.js';
import {planSitemap} from '../operations/planSitemap.js';

const selection = {
    requiredTags: ['must_be_cached'],
    maximumTargetResponseTimeMs: 200,
    minimumPriority: 3,
    limit: 2
};
const sitemapUrl = 'https://example.com/sitemap.xml';

// Exercise the actual fetch/parser/planner/selector path; no candidate page
// requests are allowed by this fixture.
test('reads only the sitemap and returns the existing ordered candidate subset', async t => {
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: URL) => {
        requests.push(String(url));
        assert.equal(String(url), sitemapUrl);
        return new Response(`<urlset>
            <url><loc>https://example.com/z</loc><priority>1</priority></url>
            <url><loc>https://example.com/category/product</loc></url>
            <url><loc>https://example.com/a</loc><priority>1</priority></url>
            <url><loc>https://example.com/low</loc><priority>0</priority></url>
        </urlset>`);
    });
    const result = await planSitemap(
        {sitemapUrl, selection}, new SitemapClient(['example.com'], 1000)
    );
    assert.equal(result.count, 4);
    assert.equal(result.matched, 3);
    assert.equal(result.selected, 2);
    assert.deepEqual(result.entries.map(entry => entry.url), [
        'https://example.com/a', 'https://example.com/z'
    ]);
    assert.deepEqual(requests, [sitemapUrl]);
});

test('validates selection and host before network access', async t => {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
    const client = new SitemapClient(['example.com'], 1000);
    await assert.rejects(planSitemap({
        sitemapUrl, selection: {...selection, limit: 11}
    }, client), /between 1 and 10/);
    await assert.rejects(planSitemap({
        sitemapUrl: 'https://other.example/sitemap.xml', selection
    }, client), /host is not allowed/);
});

test('returns an empty candidate set when filters do not match', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(
        '<urlset><url><loc>https://example.com/</loc></url></urlset>'
    ));
    const result = await planSitemap({
        sitemapUrl, selection: {...selection, requiredTags: ['unmatched']}
    }, new SitemapClient(['example.com'], 1000));
    assert.equal(result.count, 1);
    assert.equal(result.matched, 0);
    assert.equal(result.selected, 0);
    assert.deepEqual(result.entries, []);
});

test('registers the tool and exposes structured success and MCP errors', async t => {
    let handler: (input: {sitemapUrl: string; selection: typeof selection}) => Promise<any>;
    registerPlanSitemapTool({
        registerTool(name: string, _options: unknown, callback: typeof handler) {
            assert.equal(name, 'plan_sitemap');
            handler = callback;
        }
    } as unknown as McpServer);
    t.mock.method(globalThis, 'fetch', async () => new Response(
        '<urlset><url><loc>https://example.com/</loc></url></urlset>'
    ));
    const result = await handler!({
        sitemapUrl: 'https://mageosuk.reactedge.net/sitemap.xml', selection
    });
    assert.equal(result.structuredContent.selected, 1);
    assert.equal(result.content[0].text, JSON.stringify(result.structuredContent));
    const error = await handler!({sitemapUrl, selection: {...selection, limit: 0}});
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /between 1 and 10/);
});
