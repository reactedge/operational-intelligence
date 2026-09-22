import type {McpServer} from '@modelcontextprotocol/server';
import {constants} from 'node:fs';
import {access, cp, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';
import {z} from 'zod';

const execFileAsync = promisify(execFile);
const ServerNameSchema = z.string().regex(
    /^[a-z][a-z0-9-]*$/,
    'Use a lowercase service slug such as catalog-sync.'
);

export interface CreateServerInput {
    name: string;
    port: number;
}

export interface CreateServerOptions {
    root: string;
    installDependencies?: boolean;
}

const toDisplayName = (name: string): string => name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const replaceTokens = (
    content: string,
    input: CreateServerInput
): string => content
    .replaceAll('__SERVICE_NAME__', toDisplayName(input.name))
    .replaceAll('__SERVICE_SLUG__', input.name)
    .replaceAll('__SERVER_PORT__', String(input.port))
    .replaceAll('__ROUTE_PREFIX__', `/${input.name}`)
    .replaceAll('__OTEL_SERVICE_NAME__', `reactedge-${input.name}`)
    .replaceAll('__SPAN_PREFIX__', input.name.replaceAll('-', '_'));

const replaceTokensInDirectory = async (
    directory: string,
    input: CreateServerInput
): Promise<void> => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const originalPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            await replaceTokensInDirectory(originalPath, input);
        } else if (entry.isFile()) {
            const content = await readFile(originalPath, 'utf8');
            const updated = replaceTokens(content, input);
            if (updated !== content) {
                await writeFile(originalPath, updated, 'utf8');
            }
        }

        const renamedEntry = replaceTokens(entry.name, input);
        if (renamedEntry !== entry.name) {
            await rename(originalPath, path.join(directory, renamedEntry));
        }
    }
};

export const createExpressServer = async (
    input: CreateServerInput,
    options: CreateServerOptions
): Promise<string> => {
    const root = path.resolve(options.root);
    const templateDirectory = path.resolve(root, 'packages/server-template');
    const serverDirectory = path.resolve(root, input.name);
    const relativeDestination = path.relative(root, serverDirectory);

    ServerNameSchema.parse(input.name);
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
        throw new Error('port must be an integer between 1 and 65535.');
    }
    if (
        relativeDestination.startsWith('..')
        || path.isAbsolute(relativeDestination)
    ) {
        throw new Error('Generated servers must remain inside the repository root.');
    }

    await access(templateDirectory, constants.R_OK);
    try {
        await stat(serverDirectory);
        throw new Error(`Server "${input.name}" already exists.`);
    } catch (error) {
        if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) {
            throw error;
        }
    }

    try {
        await cp(templateDirectory, serverDirectory, {
            recursive: true,
            filter: source => path.basename(source) !== 'node_modules'
        });
        await replaceTokensInDirectory(serverDirectory, input);

        if (options.installDependencies !== false) {
            await execFileAsync('npm', ['install'], {cwd: serverDirectory});
        }
    } catch (error) {
        await rm(serverDirectory, {recursive: true, force: true});
        throw error;
    }

    return serverDirectory;
};

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
        async input => {
            try {
                const root = process.env.REACTEDGE_ROOT ?? process.cwd();
                await createExpressServer(input, {root});

                return {
                    content: [{
                        type: 'text',
                        text: `Created Express server "${input.name}" in ${input.name}/.`
                    }]
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{
                        type: 'text',
                        text: error instanceof Error ? error.message : String(error)
                    }]
                };
            }
        }
    );
}
