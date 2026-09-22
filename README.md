# operational-intelligence
Agent-driven operational intelligence for interoperable systems, combining continuous validation, observability, diagnosis and remediation.

## Generate an observable server

The root MCP server in `mcp/` exposes `create_server`. It creates a new Express service from
`packages/server-template` with request and route OpenTelemetry spans.

```bash
cd mcp
npm install
REACTEDGE_ROOT="$(git rev-parse --show-toplevel)" npm start
```

The tool requires a lowercase service name and port. It creates the service at
the repository root, refuses an existing destination, installs dependencies,
and derives the route, package and telemetry names from the service name.
