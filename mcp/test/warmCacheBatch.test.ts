import assert from 'node:assert/strict';
import test from 'node:test';
import type {McpServer} from '@modelcontextprotocol/server';
import {warmCacheBatch, registerWarmCacheBatchTool} from '../tools/warmCacheBatch.js';

const input = {urls: ['https://example.com/']};
const blocked = {
    status: 'completed',
    results: [{url: input.urls[0], healthy: false, durationMs: 12, status: 503}],
    gate: {allowed: false, reasons: ['1 URL failed']},
    platform: {signals: {redis: {connected: true}}}
};

test('delegates one batch and preserves a blocked gate and measurements', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        calls++;
        assert.equal(url, 'http://localhost:8081/cache-warmer/test-urls');
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body as string), input);
        assert.equal(init.redirect, 'error');
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json(blocked);
    });
    assert.deepEqual(await warmCacheBatch(input, {url: 'http://localhost:8081/cache-warmer/test-urls'}), blocked);
    assert.equal(calls, 1);
});

test('rejects invalid batch sizes and timeouts before sending', async t => {
    t.mock.method(globalThis, 'fetch', () => {throw new Error('Unexpected request');});
    for (const urls of [[], Array(11).fill(input.urls[0]), ['']]) {
        await assert.rejects(warmCacheBatch({urls}), /Too/);
    }
    await assert.rejects(warmCacheBatch(input, {timeoutMs: NaN}), /positive integer/);
});

test('rejects HTTP errors, malformed and incomplete results without retries', async t => {
    for (const response of [
        new Response('unavailable', {status: 502}),
        Response.json({status: 'completed'}),
        Response.json({...blocked, results: []}),
        new Response('invalid json')
    ]) {
        let calls = 0;
        const mock = t.mock.method(globalThis, 'fetch', async () => {calls++; return response;});
        await assert.rejects(warmCacheBatch(input));
        assert.equal(calls, 1);
        mock.mock.restore();
    }
});

test('MCP preserves structured blocked result and marks transport errors', async t => {
    let handler: (input: {urls: string[]}) => Promise<any>;
    registerWarmCacheBatchTool({registerTool(name: string, options: any, callback: typeof handler) {
        assert.equal(name, 'warm_cache_batch');
        assert.equal(options.annotations.readOnlyHint, false);
        handler = callback;
    }} as unknown as McpServer);
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(blocked));
    const result = await handler!(input);
    assert.deepEqual(result.structuredContent, blocked);
    assert.equal(result.content[0].text, JSON.stringify(blocked));
    mock.mock.mockImplementation(async () => {throw new Error('Timeout');});
    const error = await handler!(input);
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /may already have loaded/);
});
