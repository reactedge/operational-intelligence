import type {McpServer} from '@modelcontextprotocol/server';
import {SelectUrlsInputSchema} from '../operations/selectUrls';

import {handleSelectUrls} from '../handlers/selectUrls';

export function registerSelectUrlsTool(server: McpServer): void {
    server.registerTool(
        'select_urls',
        {
            title: 'Select candidate URLs',
            description: 'Plan and select from supplied sitemap entries using the existing policy. No network access. Response times are targets, not measured performance.',
            inputSchema: SelectUrlsInputSchema,
            annotations: {readOnlyHint: true, openWorldHint: false}
        },
        handleSelectUrls
    );
}
