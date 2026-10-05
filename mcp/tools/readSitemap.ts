import type {McpServer} from '@modelcontextprotocol/server';
import {ReadSitemapInputSchema} from '../operations/readSitemap';

import {handleReadSitemap} from '../handlers/readSitemap';

export function registerReadSitemapTool(server: McpServer): void {
    server.registerTool(
        'read_sitemap',
        {
            title: 'Read sitemap entries',
            description: 'Fetch and parse a sitemap URL set without planning, filtering or requesting candidate pages.',
            inputSchema: ReadSitemapInputSchema,
            annotations: {readOnlyHint: true, openWorldHint: true}
        },
        handleReadSitemap
    );
}
