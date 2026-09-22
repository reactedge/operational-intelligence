# Sitemap Planner

Transforms a remote sitemap into a cache-planning contract with request-scoped
OpenTelemetry tracing.

## Run

```bash
cp .env.sample .env
npm install
npm start
```

Verify the example route:

```bash
curl --fail http://localhost:8082/sitemap-planner/status
```

Create a plan:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{"sitemapUrl":"https://mageosuk.reactedge.net/sitemap.xml"}' \
  http://localhost:8082/sitemap-planner/plan
```

Every URL receives:

- `mustBeCached: true`;
- `targetResponseTimeMs: 200`;
- a priority from 1 to 5;
- tags expressing the cache, response-time and priority requirements.

When the sitemap provides `<priority>`, it is mapped from `0..1` to `1..5`.
Otherwise shallower paths receive a higher priority.

The planning trace contains `sitemap_planner.request`, `sitemap_planner.plan`,
`sitemap_planner.fetch_sitemap`, and `sitemap_planner.transform` spans.
