import type {z} from 'zod';
import {warmCacheBatch, WarmCacheBatchInputSchema} from '../operations/warmCacheBatch.js';

export async function handleWarmCacheBatch(input: z.infer<typeof WarmCacheBatchInputSchema>) {
    try {
        const result = await warmCacheBatch(input);
        return {
            content: [{type: 'text' as const, text: JSON.stringify(result)}],
            structuredContent: result
        };
    } catch (error) {
        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: (error instanceof Error ? error.message : String(error)) + " No automatic retry was attempted; the batch may already have loaded pages."
            }]
        };
    }
}
