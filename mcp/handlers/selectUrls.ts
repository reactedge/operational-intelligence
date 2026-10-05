import type {z} from 'zod';
import {selectUrls, SelectUrlsInputSchema} from '../operations/selectUrls';

export async function handleSelectUrls(input: z.infer<typeof SelectUrlsInputSchema>) {
    try {
        const result = await selectUrls(input);
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
