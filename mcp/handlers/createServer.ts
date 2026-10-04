import {createExpressServer, type CreateServerInput} from '../operations/createServer.js';

export async function handleCreateServer(input: CreateServerInput) {
    try {
        const root = process.env.REACTEDGE_ROOT ?? process.cwd();
        await createExpressServer(input, {root});
        return {
            content: [{
                type: 'text' as const,
                text: `Created Express server "${input.name}" in ${input.name}/.`
            }]
        };
    } catch (error) {
        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error)
            }]
        };
    }
}
