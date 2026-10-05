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

## Independent sitemap operations

The previous draft tool `plan_sitemap` is replaced by `read_sitemap` and
`select_urls`. Update callers to use these two explicit steps. Tool registration
files delegate to response handlers in `handlers/`, which call separate files
in `operations/`; both reuse the existing
sitemap-planner classes without requiring its HTTP service.

Install both packages' locked dependencies from the repository root:

```bash
npm ci --prefix mcp
npm ci --prefix sitemap-planner
```

### 1. Read a sitemap

`read_sitemap` uses the existing SitemapClient, SitemapReader and configuration.
Set `SITEMAP_ALLOWED_HOSTS` (comma-separated; default `mageosuk.reactedge.net`)
and optionally `SITEMAP_TIMEOUT_MS` (default `10000`) in the MCP process environment.
Shared configuration reads `.env` from the working directory; it does not
automatically load `sitemap-planner/.env`. For a local CA, set
`NODE_EXTRA_CA_CERTS` when launching Inspector.

Call `read_sitemap`:

```json
{"sitemapUrl": "https://mageosuk.reactedge.net/sitemap.xml"}
```

The result contains `sitemapUrl`, `count` and all parsed `entries` in source order.
Each entry has `url` and optional `sitemapPriority`. No planning, filtering,
ranking or batch limit is applied. Only the sitemap is requested, never its pages.
Only URL sets are supported; sitemap indexes are not expanded. Existing reader
behaviour is preserved, including rejection of a URL set without URL entries.

### 2. Select URLs without network access

Pass the returned `entries` array to `select_urls` alongside selection rules.
The tool also accepts independently supplied entries; it needs no sitemap URL.
For example:

```json
{
  "entries": [
    {"url": "https://mageosuk.reactedge.net/example-a", "sitemapPriority": 1},
    {"url": "https://mageosuk.reactedge.net/example-b", "sitemapPriority": 0.5}
  ],
  "selection": {
    "requiredTags": ["must_be_cached"],
    "maximumTargetResponseTimeMs": 200,
    "minimumPriority": 4,
    "limit": 2
  }
}
```

Expected: `count: 2`, `matched: 1`, `selected: 1`, and one planned entry for
`example-a`. Results contain `count` (supplied entries), `matched` (before the
limit), `selected` and selected `entries`, including planning metadata.

SitemapPlanner supplies the existing policy metadata and SitemapSelector owns
filtering, ranking and limits: priority descending, URL alphabetical for ties,
and a selection limit of 1–10. Response-time fields are policy targets, not
measured performance. Empty inputs or no matches return an empty successful result.
Supplied entry URLs must use HTTP or HTTPS; selection does not check host
allowlists or page health because it does not fetch anything.

Both tools return structured data and matching JSON text; operation failures
return MCP errors. Neither tool warms caches or checks platform signals.

### Compose and verify

Read once, retain the returned entries, then select as needed. Repeating selection
with identical input gives the same batch. To obtain another batch, the caller
must exclude processed URLs from the supplied entries. Progress persistence,
retry policy and orchestration remain separate responsibilities.

```bash
npm run typecheck --prefix mcp
npm test --prefix mcp
npm run typecheck --prefix sitemap-planner
npm test --prefix sitemap-planner
```

Tests cover independent reading, network-free selection, errors, MCP result
contracts, and composing both operations while reading the sitemap only once.
For manual verification in Inspector, call `read_sitemap`, copy its entries into
`select_urls`, and inspect the counts and selected URLs. Automated tests use
fixtures; they do not warm a live store.

## TypeScript imports

Like ReactEdge's MCP, this package uses `module: ESNext`,
`moduleResolution: Bundler` and `noEmit: true`. Relative TypeScript imports
omit file extensions. Run through the documented `tsx` commands; TypeScript
checks types without producing JavaScript. Plain Node execution of emitted
JavaScript would require a separate build and resolution setup.
