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

## Plan a sitemap

`plan_sitemap` fetches a sitemap and returns a candidate subset. It directly
reuses the sitemap-planner's `SitemapClient`, `SitemapReader`, `SitemapPlanner`,
`SitemapSelector`, and sitemap configuration. No planner HTTP service is needed.
Install both packages' locked dependencies from the repository root:

```bash
npm ci --prefix mcp
npm ci --prefix sitemap-planner
```

Set `SITEMAP_ALLOWED_HOSTS` (comma-separated; default `mageosuk.reactedge.net`)
and optionally `SITEMAP_TIMEOUT_MS` (default `10000`) in the MCP process environment.
The shared configuration also reads `.env` from the working directory. It does
not automatically load `sitemap-planner/.env`. For a local CA, use the existing
`NODE_EXTRA_CA_CERTS` setting when launching Inspector.

Call `plan_sitemap` in Inspector with:

```json
{
  "sitemapUrl": "https://mageosuk.reactedge.net/sitemap.xml",
  "selection": {
    "requiredTags": ["must_be_cached"],
    "maximumTargetResponseTimeMs": 200,
    "minimumPriority": 4,
    "limit": 2
  }
}
```

The result includes `sitemapUrl`, `count` (all planned entries), `matched`
(before the limit), `selected`, and selected `entries`, as both structured data
and JSON text. An empty match is a successful result with an empty entries array.
Existing policy is unchanged: priority descending, URL alphabetical for ties,
and a selection limit of 1–10. Response-time fields describe targets, not measured
performance. Only sitemap URL sets are supported, not sitemap indexes.

This tool reads the sitemap only: it does not request candidate pages, validate
their health, check platform signals, or invoke cache-warmer.
