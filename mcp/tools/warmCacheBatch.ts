import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';

export const WarmCacheBatchInputSchema = z.object({
    urls: z.array(z.string().min(1)).min(1).max(10)
});

const BatchResponseSchema = z.object({
    status: z.literal('completed'),
    results: z.array(z.object({
        url: z.string(),
        healthy: z.boolean(),
        durationMs: z.number().nonnegative()
    }).passthrough()),
    gate: z.object({allowed: z.boolean(), reasons: z.array(z.string())}).passthrough(),
    platform: z.record(z.string(), z.unknown())
}).passthrough();

export async function warmCacheBatch(
    input: z.infer<typeof WarmCacheBatchInputSchema>,
    options: {url?: string; timeoutMs?: number} = {}
) {
    const body = WarmCacheBatchInputSchema.parse(input);
    const url = options.url ?? process.env.CACHE_WARMER_TEST_URLS_URL
        ?? 'http://127.0.0.1:8081/cache-warmer/test-urls';
    const timeoutMs = options.timeoutMs ?? Number(process.env.CACHE_WARMER_TIMEOUT_MS ?? 120000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('CACHE_WARMER_TIMEOUT_MS must be a positive integer.');
    }
    // Delegate host validation, loading, telemetry and the next-batch gate to
    // the existing service. Never retry: a failed response may follow loading.
    const response = await fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error'
    });
    if (!response.ok) {
        throw new Error(`Cache warmer returned HTTP ${response.status}. The batch may have run; inspect the service before retrying.`);
    }
    const result = BatchResponseSchema.parse(await response.json());
    if (result.results.length !== body.urls.length) {
        throw new Error('Cache warmer returned an incomplete batch result. Do not continue automatically.');
    }
    return result;
}

export function registerWarmCacheBatchTool(server: McpServer): void {
    server.registerTool('warm_cache_batch', {
        title: 'Warm one cache batch',
        description: 'Load 1–10 explicit URLs through the existing cache-warmer service. Returns measurements, platform status and the gate for the NEXT batch. This gate is evaluated after loading, not a preflight check. Stop when gate.allowed is false. Does not loop or retry; errors may occur after pages have been loaded.',
        inputSchema: WarmCacheBatchInputSchema,
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true}
    }, async input => {
        try {
            const result = await warmCacheBatch(input);
            return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
        } catch (error) {
            return {isError: true, content: [{type: 'text', text:
                `${error instanceof Error ? error.message : String(error)} No automatic retry was attempted; the batch may already have loaded pages.`
            }]};
        }
    });
}
