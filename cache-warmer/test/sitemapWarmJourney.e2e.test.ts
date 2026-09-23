import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import {
    runSitemapWarmJourney,
    type JourneyCapacityDecision,
    type JourneyCapacityPolicy,
} from "../src/worker/sitemapWarmJourney";

type TelemetryEvent = {
    name: string;
    attributes: Record<string, string | number | boolean>;
};

class SequenceCapacityPolicy implements JourneyCapacityPolicy {
    private index = 0;

    constructor(
        private readonly decisions: JourneyCapacityDecision[],
    ) {}

    async evaluate(): Promise<JourneyCapacityDecision> {
        const decision = this.decisions[this.index]
            ?? this.decisions.at(-1)
            ?? { available: true };

        this.index += 1;
        return decision;
    }
}

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

async function startFixtureServer() {
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

    const address = server.address();
    assert.ok(address && typeof address === "object");

    const baseUrl = `http://127.0.0.1:${address.port}`;
    sitemapXml = buildSitemap(baseUrl);

    return {
        server,
        requestedPaths,
        baseUrl,
    };
}

test("end to end: fetch sitemap, select priority URLs, warm them in batches and emit telemetry", async (t) => {
    const fixture = await startFixtureServer();

    t.after(async () => {
        fixture.server.close();
        await once(fixture.server, "close");
    });

    const telemetry: TelemetryEvent[] = [];

    const result = await runSitemapWarmJourney({
        sitemapUrl: `${fixture.baseUrl}/sitemap.xml`,
        minimumPriority: 0.5,
        batchSize: 5,
        telemetry: {
            observe(name, attributes = {}) {
                telemetry.push({ name, attributes });
            },
        },
    });

    assert.equal(result.state, "completed");
    assert.equal(result.discovered, 40);
    assert.equal(result.selected, 24);
    assert.equal(result.warmed, 24);
    assert.equal(result.nextOffset, 24);

    const warmRequests = fixture.requestedPaths.filter(path => path !== "/sitemap.xml");
    assert.equal(fixture.requestedPaths[0], "/sitemap.xml");
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
        "cache_warmer.start_offset": 0,
    });

    const capacityChecks = telemetry.filter(
        event => event.name === "cache_warmer.capacity.checked",
    );
    assert.equal(capacityChecks.length, 5);
    assert.ok(capacityChecks.every(
        event => event.attributes["cache_warmer.capacity.available"] === true,
    ));

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

test("end to end: defer on saturation and resume without repeating completed URLs", async (t) => {
    const fixture = await startFixtureServer();

    t.after(async () => {
        fixture.server.close();
        await once(fixture.server, "close");
    });

    const telemetry: TelemetryEvent[] = [];
    const observe = (name: string, attributes: Record<string, string | number | boolean> = {}) => {
        telemetry.push({ name, attributes });
    };

    const firstRun = await runSitemapWarmJourney({
        sitemapUrl: `${fixture.baseUrl}/sitemap.xml`,
        minimumPriority: 0.5,
        batchSize: 5,
        capacity: new SequenceCapacityPolicy([
            { available: true },
            { available: true },
            { available: false, retryAfterMs: 30_000, reason: "cpu" },
        ]),
        telemetry: { observe },
    });

    assert.equal(firstRun.state, "deferred");
    assert.equal(firstRun.warmed, 10);
    assert.equal(firstRun.nextOffset, 10);
    assert.equal(firstRun.retryAfterMs, 30_000);
    assert.equal(firstRun.reason, "cpu");

    const warmRequestsAfterFirstRun = fixture.requestedPaths.filter(
        path => path !== "/sitemap.xml",
    );
    assert.equal(warmRequestsAfterFirstRun.length, 10);

    const deferred = telemetry.find(
        event => event.name === "cache_warmer.journey.deferred",
    );
    assert.deepEqual(deferred?.attributes, {
        "cache_warmer.next_offset": 10,
        "cache_warmer.retry_after_ms": 30_000,
        "cache_warmer.capacity.reason": "cpu",
    });

    const secondRun = await runSitemapWarmJourney({
        sitemapUrl: `${fixture.baseUrl}/sitemap.xml`,
        minimumPriority: 0.5,
        batchSize: 5,
        startOffset: firstRun.nextOffset,
        capacity: new SequenceCapacityPolicy([{ available: true }]),
        telemetry: { observe },
    });

    assert.equal(secondRun.state, "completed");
    assert.equal(secondRun.warmed, 14);
    assert.equal(secondRun.nextOffset, 24);

    const allWarmRequests = fixture.requestedPaths.filter(
        path => path !== "/sitemap.xml",
    );

    assert.equal(allWarmRequests.length, 24);
    assert.equal(new Set(allWarmRequests).size, 24);

    const expectedPaths = secondRun.selectedEntries.map(
        entry => new URL(entry.url).pathname,
    );
    assert.deepEqual(allWarmRequests, expectedPaths);

    const sitemapRequests = fixture.requestedPaths.filter(
        path => path === "/sitemap.xml",
    );
    assert.equal(sitemapRequests.length, 2);
});
