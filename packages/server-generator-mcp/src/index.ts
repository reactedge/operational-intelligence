import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {createServerFromTemplate} from './generator.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const template = path.resolve(currentDirectory, '../../server-template');

const createServer = (): McpServer => {
    const server = new McpServer({
        name: 'reactedge-server-generator',
        version: '0.1.0'
    });

    server.registerTool(
        'create_server_from_template',
        {
            description: 'Create an observable Express server from the ReactEdge template.',
            inputSchema: z.object({
                serviceName: z.string().min(1).describe('Human-readable service name'),
                destination: z.string().min(1).describe('Destination relative to SERVER_GENERATOR_ROOT'),
                port: z.number().int().min(1).max(65535),
                routePrefix: z.string().min(2).describe('Route prefix such as /catalog-sync'),
                otelServiceName: z.string().min(1).optional()
            })
        },
        async input => {
            try {
                const result = await createServerFromTemplate(input, {
                    root: process.env.SERVER_GENERATOR_ROOT ?? process.cwd(),
                    template
                });
                return {
                    content: [{
                        type: 'text',
                        text: `Created ${result.serviceSlug} at ${result.destination}`
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: error instanceof Error ? error.message : String(error)
                    }],
                    isError: true
                };
            }
        }
    );

    return server;
};

void serveStdio(createServer);
