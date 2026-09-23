import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import { runSitemapWarmJourney } from "../src/worker/sitemapWarmJourney";

type TelemetryEvent = {
    name: string;
    attributes: Record<string, string | number | boolean>;
};

function buildSitemap(baseUrl: string): string {
    const urls = Array.from({ length: 40 }, (_, index) => {
        const priority = ((index % 10) + 1) / 10;
        const number = String(index + 1).padStart(2, "0");

        return [
            "  <url>",
            `    <loc>${baseUrl}/page-${number}.html</loc>`,
            `    <priority>${priority.toFixed(1)}</priority>`,
            "  </url>",
        ].join("\n");
    });

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
    ].join("\n");
}

test("end to end: fetch sitemap, select priority URLs, warm them in batches and emit telemetry", async (t) => {
    const requestedPaths: string[] = [];
    let sitemapXml = "";

    const server = http.createServer((request, response) => {
        const path = request.url ?? "/";
        requestedPaths.push(path);

        if (path === "/sitemap.xml") {
            response.writeHead(200, { "content-type": "application/xml" });
            response.end(sitemapXml);
            return;
        }

        if (/^\/page-\d{2}\.html$/.test(path)) {
            response.writeHead(200, {
                "content-type": "text/html",
                "x-magento-cache-debug": "HIT",
            });
            response.end(`<html><body>${path}</body></html>`);
            return;
        }

        response.writeHead(404);
        response.end("not found");
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    t.after(async () => {
        server.close();
        await once(server, "close");
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");

    const baseUrl = `http://127.0.0.1:${address.port}`;
    sitemapXml = buildSitemap(baseUrl);

    const telemetry: TelemetryEvent[] = [];

    const result = await runSitemapWarmJourney({
        sitemapUrl: `${baseUrl}/sitemap.xml`,
        minimumPriority: 0.5,
        batchSize: 5,
        telemetry: {
            observe(name, attributes = {}) {
                telemetry.push({ name, attributes });
            },
        },
    });

    assert.equal(result.discovered, 40);
    assert.equal(result.selected, 24);
    assert.equal(result.warmed, 24);

    const warmRequests = requestedPaths.filter(path => path !== "/sitemap.xml");
    assert.equal(requestedPaths[0], "/sitemap.xml");
    assert.equal(warmRequests.length, 24);
    assert.equal(new Set(warmRequests).size, 24);

    const selectedPaths = result.selectedEntries.map(entry => new URL(entry.url).pathname);
    assert.deepEqual(warmRequests, selectedPaths);

    for (const path of warmRequests) {
        const pageNumber = Number(path.match(/page-(\d{2})\.html/)?.[1]);
        assert.ok(Number.isInteger(pageNumber));
        const priority = (((pageNumber - 1) % 10) + 1) / 10;
        assert.ok(priority >= 0.5, `${path} should satisfy minimum priority`);
    }

    const eventNames = telemetry.map(event => event.name);
    assert.equal(eventNames[0], "cache_warmer.sitemap_fetch.started");
    assert.equal(eventNames[1], "cache_warmer.sitemap_fetch.completed");
    assert.equal(eventNames[2], "cache_warmer.sitemap_selection.completed");

    const selection = telemetry.find(
        event => event.name === "cache_warmer.sitemap_selection.completed",
    );
    assert.deepEqual(selection?.attributes, {
        "cache_warmer.url.discovered": 40,
        "cache_warmer.url.selected": 24,
        "cache_warmer.minimum_priority": 0.5,
    });

    const batchStarted = telemetry.filter(
        event => event.name === "cache_warmer.batch.started",
    );
    const batchCompleted = telemetry.filter(
        event => event.name === "cache_warmer.batch.completed",
    );

    assert.deepEqual(
        batchStarted.map(event => event.attributes["cache_warmer.batch.size"]),
        [5, 5, 5, 5, 4],
    );
    assert.equal(batchCompleted.length, 5);

    const loadStarted = telemetry.filter(
        event => event.name === "cache_warmer.load_url.started",
    );
    const loadCompleted = telemetry.filter(
        event => event.name === "cache_warmer.load_url.completed",
    );

    assert.equal(loadStarted.length, 24);
    assert.equal(loadCompleted.length, 24);
    assert.ok(loadCompleted.every(
        event => event.attributes["cache_warmer.healthy"] === true,
    ));
    assert.ok(loadCompleted.every(
        event => event.attributes["http.response.status_code"] === 200,
    ));
});
