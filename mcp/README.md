# Operational Intelligence MCP

The root MCP server follows the same registration structure as Magento
Starter: `server.ts` composes tools from `tools/`.

## Run

```bash
cd mcp
npm install
REACTEDGE_ROOT="$(git rev-parse --show-toplevel)" npm start
```

## Test with MCP Inspector

From the repository root, after installing the dependencies above:

```bash
npx @modelcontextprotocol/inspector npx tsx mcp/server.ts
```

Unlike Magento Starter, this command has no trailing `default` argument.
Magento Starter uses that argument to select a store-specific `.env.default`;
the Operational Intelligence generator does not require store configuration.

If the command is launched from somewhere other than the repository root, set
the root explicitly:

```bash
REACTEDGE_ROOT=/absolute/path/to/operational-intelligence \
  npx @modelcontextprotocol/inspector npx tsx mcp/server.ts
```

The `create_server` tool accepts a lowercase service `name` and a `port`. It
creates `<repository>/<name>`, replaces the template tokens, and installs the
generated service dependencies.
