# Operational Intelligence MCP

The root MCP server follows the same registration structure as Magento
Starter: `server.ts` composes tools from `tools/`.

## Run

```bash
cd mcp
npm install
REACTEDGE_ROOT="$(git rev-parse --show-toplevel)" npm start
```

The `create_server` tool accepts a lowercase service `name` and a `port`. It
creates `<repository>/<name>`, replaces the template tokens, and installs the
generated service dependencies.
