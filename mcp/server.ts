import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {registerCreateServerTool} from './tools/createServer.js';

function createServer(): McpServer {
    const server = new McpServer({
        name: 'reactedge-operational-intelligence',
        version: '0.1.0'
    });

    registerCreateServerTool(server);

    return server;
}

void serveStdio(createServer);
