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

## Warm one cache batch

`warm_cache_batch` delegates to the running cache-warmer service's existing
`POST /cache-warmer/test-urls` route. Start that service and its platform-signals
dependency with their normal configuration. The service owns URL/host validation,
page loading, telemetry and the safety policy; MCP does not duplicate them.

Optional MCP process environment:

```bash
CACHE_WARMER_TEST_URLS_URL=http://127.0.0.1:8081/cache-warmer/test-urls
CACHE_WARMER_TIMEOUT_MS=120000
```

Inspector input (replace with an allowed store URL):

```json
{"urls":["https://mageosuk.reactedge.net/"]}
```

After `plan_sitemap`, pass selected `entries[].url` explicitly, in batches of
1–10. Empty selections require no call. The result preserves `status`, `results`,
`gate` and `platform` as structured content and JSON text. A completed batch can
contain failed URLs: inspect `results` and stop when `gate.allowed` is false.
The gate concerns the **next** batch and is evaluated **after** loading this one;
it does not protect the first batch with a preflight check.

This tool makes one request, without automatic retries, chunking or continuation.
HTTP/dependency failures, timeouts and malformed replies become MCP errors; pages
may already have loaded when an error occurs. Inspect service telemetry before
retrying. A successful load does not itself prove a cache hit; inspect the cache
fields returned for each URL. Standalone platform checks and agent orchestration
remain separate work.
