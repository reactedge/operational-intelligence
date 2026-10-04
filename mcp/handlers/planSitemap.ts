import type {z} from 'zod';
import {planSitemap, PlanSitemapInputSchema} from '../operations/planSitemap.js';

export async function handlePlanSitemap(input: z.infer<typeof PlanSitemapInputSchema>) {
    try {
        const result = await planSitemap(input);
        return {
            content: [{type: 'text' as const, text: JSON.stringify(result)}],
            structuredContent: result
        };
    } catch (error) {
        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: (error instanceof Error ? error.message : String(error))
            }]
        };
    }
}
