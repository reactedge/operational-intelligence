import type {McpServer} from '@modelcontextprotocol/server';
import {WarmCacheBatchInputSchema} from '../operations/warmCacheBatch.js';
import {handleWarmCacheBatch} from '../handlers/warmCacheBatch.js';

export function registerWarmCacheBatchTool(server: McpServer): void {
    server.registerTool('warm_cache_batch', {
        title: 'Warm one cache batch',
        description: 'Load 1–10 explicit URLs through the existing cache-warmer service. Returns measurements, platform status and the gate for the NEXT batch. This gate is evaluated after loading, not a preflight check. Stop when gate.allowed is false. Does not loop or retry; errors may occur after pages have been loaded.',
        inputSchema: WarmCacheBatchInputSchema,
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true}
    }, handleWarmCacheBatch
    );
}
