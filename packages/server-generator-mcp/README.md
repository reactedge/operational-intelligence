# Server Generator MCP

Local stdio MCP server exposing `create_server_from_template`.

The tool creates a new Express/OpenTelemetry service from
`packages/server-template`. It refuses absolute paths, path traversal, and
existing destinations.

```bash
npm install
npm start
```

Set `SERVER_GENERATOR_ROOT` to the directory under which generated services
may be created. It defaults to the process working directory.
