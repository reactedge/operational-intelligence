import assert from 'node:assert/strict';
import test from 'node:test';
import {SitemapPlanner} from '../src/model/sitemap/sitemap-planner';
import {SitemapReader} from '../src/model/sitemap/sitemap-reader';

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
