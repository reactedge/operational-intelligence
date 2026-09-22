# operational-intelligence
Agent-driven operational intelligence for interoperable systems, combining continuous validation, observability, diagnosis and remediation.

## Generate an observable server

The local MCP server in `packages/server-generator-mcp` exposes
`create_server_from_template`. It creates a new Express service from
`packages/server-template` with request and route OpenTelemetry spans.

```bash
cd packages/server-generator-mcp
npm install
SERVER_GENERATOR_ROOT="$(git rev-parse --show-toplevel)" npm start
```

The tool requires a service name, repository-relative destination, port, and
route prefix. It refuses existing destinations and paths outside the configured
root.
