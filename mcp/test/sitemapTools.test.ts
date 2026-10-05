import assert from 'node:assert/strict';
import test from 'node:test';
import type {McpServer} from '@modelcontextprotocol/server';
import {SitemapClient} from '../../sitemap-planner/src/model/sitemap/sitemap-client';
import {readSitemap} from '../operations/readSitemap';
import {selectUrls} from '../operations/selectUrls';
import {registerReadSitemapTool} from '../tools/readSitemap';
import {registerSelectUrlsTool} from '../tools/selectUrls';

const sitemapUrl = 'https://example.com/sitemap.xml';
const client = () => new SitemapClient(['example.com'], 1000);
const entries = [
    {url: 'https://example.com/z', sitemapPriority: 1},
    {url: 'https://example.com/category/product'},
    {url: 'https://example.com/a', sitemapPriority: 1},
    {url: 'https://example.com/low', sitemapPriority: 0}
];
const xml = '<urlset>' + entries.map(entry =>
    '<url><loc>' + entry.url + '</loc>' +
    (entry.sitemapPriority === undefined ? '' : '<priority>' + entry.sitemapPriority + '</priority>') +
    '</url>'
).join('') + '</urlset>';
const selection = {
    requiredTags: ['must_be_cached'], maximumTargetResponseTimeMs: 200,
    minimumPriority: 3, limit: 2
};

test('reading returns all raw entries in source order and requests only the sitemap', async t => {
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: URL) => {
        requests.push(String(url));
        assert.equal(String(url), sitemapUrl);
        return new Response(xml);
    });
    const result = await readSitemap({sitemapUrl}, client());
    assert.equal(result.count, 4);
    assert.deepEqual(JSON.parse(JSON.stringify(result.entries)), entries);
    assert.equal('selected' in result, false);
    assert.deepEqual(requests, [sitemapUrl]);
});

test('reading preserves host and protocol validation before network access', async t => {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
    await assert.rejects(readSitemap({sitemapUrl: 'https://other.example/sitemap.xml'}, client()), /host is not allowed/);
    await assert.rejects(readSitemap({sitemapUrl: 'file:///sitemap.xml'}, client()), /HTTP or HTTPS/);
});

test('reading exposes HTTP, transport and unsupported document errors', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', {status: 503}));
    await assert.rejects(readSitemap({sitemapUrl}, client()), /HTTP 503/);
    fetch.mock.mockImplementation(async () => { throw new Error('connection lost'); });
    await assert.rejects(readSitemap({sitemapUrl}, client()), /connection lost/);
    fetch.mock.mockImplementation(async () => new Response('<sitemapindex/>'));
    await assert.rejects(readSitemap({sitemapUrl}, client()), /not a sitemap URL set/);
});

test('selection works independently without fetching or mutating supplied entries', t => {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
    const supplied = structuredClone(entries);
    const result = selectUrls({entries: supplied, selection});
    assert.equal(result.count, 4);
    assert.equal(result.matched, 3);
    assert.equal(result.selected, 2);
    assert.deepEqual(result.entries.map(entry => entry.url), [entries[2].url, entries[0].url]);
    assert.deepEqual(supplied, entries);
    assert.deepEqual(selectUrls({entries, selection}), result);
});

test('selection handles empty inputs and unmatched filters', () => {
    assert.deepEqual(selectUrls({entries: [], selection}), {count: 0, matched: 0, selected: 0, entries: []});
    assert.deepEqual(selectUrls({entries, selection: {...selection, requiredTags: ['unmatched']}}),
        {count: 4, matched: 0, selected: 0, entries: []});
});

test('selection validates policy and externally supplied entries', () => {
    for (const limit of [0, 11, 1.5]) {
        assert.throws(() => selectUrls({entries, selection: {...selection, limit}}), /between 1 and 10/);
    }
    assert.throws(() => selectUrls({entries, selection: {...selection, minimumPriority: 6}}), /between 1 and 5/);
    assert.throws(() => selectUrls({entries, selection: {...selection, maximumTargetResponseTimeMs: 0}}), /positive/);
    assert.throws(() => selectUrls({entries: [{url: 'invalid'}], selection}));
});

test('read output composes with selection and can be reused for another batch', async t => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(xml); });
    const read = await readSitemap({sitemapUrl}, client());
    const first = selectUrls({entries: read.entries, selection});
    // Progress/exclusion belongs to the caller, not to either capability.
    const processed = new Set(first.entries.map(entry => entry.url));
    const second = selectUrls({
        entries: read.entries.filter(entry => !processed.has(entry.url)), selection
    });
    assert.deepEqual(second.entries.map(entry => entry.url), [entries[1].url]);
    assert.equal(requests, 1);
});

test('separate registrations return structured results and MCP errors', async t => {
    const handlers = new Map<string, (input: any) => Promise<any>>();
    const server = {
        registerTool(name: string, _options: unknown, callback: (input: any) => Promise<any>) {
            handlers.set(name, callback);
        }
    } as unknown as McpServer;
    registerReadSitemapTool(server);
    registerSelectUrlsTool(server);
    assert.deepEqual([...handlers.keys()], ['read_sitemap', 'select_urls']);
    t.mock.method(globalThis, 'fetch', async () => new Response(xml));
    const read = await handlers.get('read_sitemap')!({sitemapUrl: 'https://mageosuk.reactedge.net/sitemap.xml'});
    const selected = await handlers.get('select_urls')!({entries: read.structuredContent.entries, selection});
    for (const result of [read, selected]) {
        assert.equal(result.isError, undefined);
        assert.equal(result.content[0].text, JSON.stringify(result.structuredContent));
    }
    assert.equal(selected.structuredContent.selected, 2);
    const readError = await handlers.get('read_sitemap')!({sitemapUrl: 'file:///sitemap.xml'});
    const selectionError = await handlers.get('select_urls')!({entries, selection: {...selection, limit: 0}});
    assert.equal(readError.isError, true);
    assert.equal(selectionError.isError, true);
    assert.match(selectionError.content[0].text, /between 1 and 10/);
});
