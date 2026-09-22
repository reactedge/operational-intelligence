import {constants} from 'node:fs';
import {access, cp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

export interface ServerTemplateInput {
    serviceName: string;
    destination: string;
    port: number;
    routePrefix: string;
    otelServiceName?: string;
}

export interface GeneratedServer {
    destination: string;
    serviceSlug: string;
    routePrefix: string;
}

const textExtensions = new Set([
    '.json', '.md', '.ts', '.sample', '.txt', '.yml', '.yaml'
]);

const slugify = (value: string): string => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normaliseRoutePrefix = (value: string): string => {
    const trimmed = value.trim();
    if (!/^\/[a-z0-9][a-z0-9/_-]*$/i.test(trimmed)) {
        throw new Error('routePrefix must be an absolute URL path.');
    }
    return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
};

const assertDestination = (root: string, requested: string): string => {
    if (path.isAbsolute(requested)) {
        throw new Error('destination must be relative to SERVER_GENERATOR_ROOT.');
    }

    const destination = path.resolve(root, requested);
    const relative = path.relative(root, destination);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('destination must remain inside SERVER_GENERATOR_ROOT.');
    }
    return destination;
};

const replaceTokens = async (
    directory: string,
    replacements: Record<string, string>
): Promise<void> => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await replaceTokens(filePath, replacements);
            continue;
        }
        if (!textExtensions.has(path.extname(entry.name))) continue;

        let content = await readFile(filePath, 'utf8');
        for (const [token, replacement] of Object.entries(replacements)) {
            content = content.replaceAll(token, replacement);
        }
        await writeFile(filePath, content, 'utf8');
    }
};

export const createServerFromTemplate = async (
    input: ServerTemplateInput,
    options: {root: string; template: string}
): Promise<GeneratedServer> => {
    const root = path.resolve(options.root);
    const template = path.resolve(options.template);
    const destination = assertDestination(root, input.destination);
    const serviceSlug = slugify(input.serviceName);
    const routePrefix = normaliseRoutePrefix(input.routePrefix);

    if (!serviceSlug) throw new Error('serviceName must contain letters or numbers.');
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
        throw new Error('port must be an integer between 1 and 65535.');
    }
    await access(template, constants.R_OK);
    try {
        await stat(destination);
        throw new Error(`destination already exists: ${input.destination}`);
    } catch (error) {
        if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) {
            throw error;
        }
    }

    try {
        await cp(template, destination, {
            recursive: true,
            filter: source => path.basename(source) !== 'node_modules'
        });
        await replaceTokens(destination, {
            '__SERVICE_NAME__': input.serviceName.trim(),
            '__SERVICE_SLUG__': serviceSlug,
            '__SERVER_PORT__': String(input.port),
            '__ROUTE_PREFIX__': routePrefix,
            '__OTEL_SERVICE_NAME__': input.otelServiceName?.trim()
                || `reactedge-${serviceSlug}`,
            '__SPAN_PREFIX__': serviceSlug.replaceAll('-', '_')
        });
    } catch (error) {
        await rm(destination, {recursive: true, force: true});
        throw error;
    }

    return {destination, serviceSlug, routePrefix};
};
