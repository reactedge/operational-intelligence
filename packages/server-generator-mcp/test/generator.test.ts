import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServerFromTemplate} from '../src/generator.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const template = path.resolve(currentDirectory, '../../server-template');

test('creates a configured server without unresolved tokens', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'server-generator-'));
    const result = await createServerFromTemplate({
        serviceName: 'Catalog Sync',
        destination: 'catalog-sync',
        port: 8090,
        routePrefix: '/catalog-sync'
    }, {root, template});

    const config = await readFile(
        path.join(result.destination, 'src/config.ts'),
        'utf8'
    );
    const packageJson = await readFile(
        path.join(result.destination, 'package.json'),
        'utf8'
    );

    assert.match(config, /port: Number\(process\.env\.PORT \?\? '8090'\)/);
    assert.match(config, /servicePrefix: '\/catalog-sync'/);
    assert.match(packageJson, /@reactedge\/catalog-sync/);
    assert.doesNotMatch(`${config}${packageJson}`, /__[A-Z_]+__/);
});

test('rejects destinations outside the configured root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'server-generator-'));
    await assert.rejects(
        createServerFromTemplate({
            serviceName: 'Unsafe',
            destination: '../unsafe',
            port: 8090,
            routePrefix: '/unsafe'
        }, {root, template}),
        /inside SERVER_GENERATOR_ROOT/
    );
});
