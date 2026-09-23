import assert from 'node:assert/strict';
import test from 'node:test';
import {TestUrlsHandler} from '../src/controller/test-urls-handler';
import {PerformanceEntry, SitemapEntry} from '../src/model/performance/types';

test('loads the complete batch before reading platform signals once', async () => {
    const events: string[] = [];
    const results: PerformanceEntry[] = [];
    const batchLoader = {
        async measure(entries: SitemapEntry[]) {
            events.push(`batch:${entries.length}`);
            results.push(...entries.map(entry => ({
                ...entry,
                durationMs: 100,
                healthy: true,
                status: 200
            })));
            return {getEntries: () => results};
        }
    };
    const platformSignals = {
        async getStatus() {
            events.push('platform');
            return {
                timestamp: '2026-09-23T12:00:00Z',
                platform: {
                    hostname: 'localhost',
                    environment: 'test',
                    service: 'platform-signals',
                    version: '0.1.0'
                },
                signals: {
                    cpu: {usagePercent: 10},
                    memory: {usagePercent: 20},
                    disk: {usagePercent: 30},
                    redis: {connected: true},
                    varnish: {connected: true}
                }
            };
        }
    };
    const safetyPolicy = {
        evaluate(batchResults: PerformanceEntry[]) {
            events.push(`gate:${batchResults.length}`);
            return {allowed: true, reasons: []};
        }
    };
    const operation = {
        setAttribute() {},
        addEvent() {},
        succeed() {},
        fail() {}
    };
    const telemetry = {
        startChildOperation() {
            return operation;
        }
    };
    let responseBody: unknown;
    const response = {
        locals: {routeOperation: operation},
        status() {
            return this;
        },
        json(body: unknown) {
            responseBody = body;
            return this;
        }
    };
    const request = {
        app: {locals: {telemetry}},
        body: {
            urls: [
                'https://mageosuk.reactedge.net/one',
                'https://mageosuk.reactedge.net/two',
                'https://mageosuk.reactedge.net/three'
            ]
        }
    };

    await new TestUrlsHandler(
        batchLoader as never,
        platformSignals as never,
        safetyPolicy as never
    ).testUrls(request as never, response as never);

    assert.deepEqual(events, ['batch:3', 'platform', 'gate:3']);
    assert.equal((responseBody as {status: string}).status, 'completed');
    assert.equal(
        (responseBody as {results: PerformanceEntry[]}).results.length,
        3
    );
});
