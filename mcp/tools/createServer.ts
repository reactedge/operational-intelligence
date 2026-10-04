import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {ServerNameSchema} from '../operations/createServer.js';
import {handleCreateServer} from '../handlers/createServer.js';

export function registerCreateServerTool(server: McpServer): void {
    server.registerTool(
        'create_server',
        {
            title: 'Create an observable Express server',
            description: 'Create an Express server from the canonical observable server template.',
            inputSchema: z.object({
                name: ServerNameSchema,
                port: z.number().int().min(1).max(65535)
            })
        },
        handleCreateServer
    );
}
