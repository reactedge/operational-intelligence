import assert from 'node:assert/strict';
import test from 'node:test';
import {CacheWarmerClient} from '../src/model/cache-warmer/cache-warmer-client';
import {SitemapPlanner} from '../src/model/sitemap/sitemap-planner';
import {SitemapReader} from '../src/model/sitemap/sitemap-reader';
import {SitemapSelector} from '../src/model/sitemap/sitemap-selector';

test('parses sitemap URLs and applies explicit sitemap priority', () => {
    const entries = new SitemapReader().parse(`
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
                <loc>https://example.com/</loc>
                <priority>1.0</priority>
            </url>
            <url>
                <loc>https://example.com/catalog/product.html</loc>
                <priority>0.5</priority>
            </url>
        </urlset>
    `);
    const planner = new SitemapPlanner();
    const planned = entries.map(entry => planner.plan(entry));

    assert.equal(planned[0].priority, 5);
    assert.equal(planned[1].priority, 3);
    assert.deepEqual(planned[0].tags, [
        'must_be_cached',
        'response_time_under_200ms',
        'priority_5'
    ]);
});

test('falls back to path depth when sitemap priority is absent', () => {
    const planner = new SitemapPlanner();

    assert.equal(planner.plan({url: 'https://example.com/'}).priority, 5);
    assert.equal(planner.plan({url: 'https://example.com/category'}).priority, 4);
    assert.equal(
        planner.plan({url: 'https://example.com/category/product'}).priority,
        3
    );
});

test('selects a deterministic priority-ordered batch from configuration', () => {
    const planner = new SitemapPlanner();
    const entries = [
        planner.plan({url: 'https://example.com/category/product'}),
        planner.plan({url: 'https://example.com/'}),
        planner.plan({url: 'https://example.com/category'})
    ];

    const selection = new SitemapSelector().select(entries, {
        requiredTags: ['must_be_cached'],
        maximumTargetResponseTimeMs: 400,
        minimumPriority: 3,
        limit: 2
    });

    assert.equal(selection.matched, 3);
    assert.deepEqual(
        selection.entries.map(entry => entry.url),
        ['https://example.com/', 'https://example.com/category']
    );
});

test('rejects selection limits above the cache-warmer batch maximum', () => {
    assert.throws(
        () => new SitemapSelector().select([], {
            requiredTags: ['must_be_cached'],
            maximumTargetResponseTimeMs: 400,
            minimumPriority: 1,
            limit: 11
        }),
        /between 1 and 10/
    );
});

test('delegates only the selected URL array to cache-warmer', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: unknown;
    globalThis.fetch = async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({status: 'completed'}), {
            status: 200,
            headers: {'content-type': 'application/json'}
        });
    };

    const operation = {
        setAttribute() {},
        succeed() {},
        fail() {}
    };
    const telemetry = {
        startChildOperation() {
            return operation;
        }
    };

    try {
        const result = await new CacheWarmerClient(
            'http://localhost:8081/cache-warmer/test-urls',
            1000
        ).warm(
            ['https://example.com/', 'https://example.com/category'],
            telemetry as never,
            operation as never
        );

        assert.deepEqual(requestBody, {
            urls: [
                'https://example.com/',
                'https://example.com/category'
            ]
        });
        assert.deepEqual(result, {status: 'completed'});
    } finally {
        globalThis.fetch = originalFetch;
    }
});
