import type {z} from 'zod';
import {readSitemap, ReadSitemapInputSchema} from '../operations/readSitemap.js';

export async function handleReadSitemap(input: z.infer<typeof ReadSitemapInputSchema>) {
    try {
        const result = await readSitemap(input);
        return {
            content: [{type: 'text' as const, text: JSON.stringify(result)}],
            structuredContent: result
        };
    } catch (error) {
        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error)
            }]
        };
    }
}
