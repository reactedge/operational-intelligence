import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createExpressServer} from '../tools/createServer.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '../..');

const createFixtureRoot = async (): Promise<string> => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'create-server-'));
    await cp(
        path.join(repositoryRoot, 'packages/server-template'),
        path.join(root, 'packages/server-template'),
        {recursive: true, filter: source => path.basename(source) !== 'node_modules'}
    );
    return root;
};

test('creates a configured observable Express server', async () => {
    const root = await createFixtureRoot();
    const destination = await createExpressServer(
        {name: 'catalog-sync', port: 8090},
        {root, installDependencies: false}
    );
    const config = await readFile(path.join(destination, 'src/config.ts'), 'utf8');
    const middleware = await readFile(
        path.join(destination, 'src/observability/request-operation-middleware.ts'),
        'utf8'
    );

    assert.match(config, /servicePrefix: '\/catalog-sync'/);
    assert.match(config, /reactedge-catalog-sync/);
    assert.match(middleware, /createRequestOperationMiddleware/);
    assert.match(middleware, /createRouteOperationMiddleware/);
});

test('rejects unsafe service names', async () => {
    const root = await createFixtureRoot();
    await assert.rejects(
        createExpressServer(
            {name: '../unsafe', port: 8090},
            {root, installDependencies: false}
        ),
        /lowercase service slug/
    );
});
