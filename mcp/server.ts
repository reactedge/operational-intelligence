import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {registerCreateServerTool} from './tools/createServer';
import {registerReadSitemapTool} from './tools/readSitemap';
import {registerSelectUrlsTool} from './tools/selectUrls';

function createServer(): McpServer {
    const server = new McpServer({
        name: 'reactedge-operational-intelligence',
        version: '0.1.0'
    });

    registerCreateServerTool(server);
    registerReadSitemapTool(server);
    registerSelectUrlsTool(server);

    return server;
}

void serveStdio(createServer);
