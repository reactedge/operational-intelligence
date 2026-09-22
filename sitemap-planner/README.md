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

## Select and warm URLs

`POST /sitemap-planner/warm` builds the tagged plan internally, selects at
most ten matching URLs, and delegates that bounded batch to cache-warmer.
Selection is supplied with each request rather than hard-coded in the service.

The `targetResponseTimeMs` value is a target used for selection. The cache
warmer's result contains the measured duration; the target is not presented as
an observed response time.

Start cache-warmer on port `8081`, then choose one of these configurations.

### Critical pages

Select two priority-5 pages with a target no slower than 200 ms:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "sitemapUrl": "https://mageosuk.reactedge.net/sitemap.xml",
    "selection": {
      "requiredTags": ["must_be_cached"],
      "maximumTargetResponseTimeMs": 200,
      "minimumPriority": 5,
      "limit": 2
    }
  }' \
  http://localhost:8082/sitemap-planner/warm
```

### High-priority batch

Select up to five URLs at priority 4 or above with a 400 ms target:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "sitemapUrl": "https://mageosuk.reactedge.net/sitemap.xml",
    "selection": {
      "requiredTags": ["must_be_cached"],
      "maximumTargetResponseTimeMs": 400,
      "minimumPriority": 4,
      "limit": 5
    }
  }' \
  http://localhost:8082/sitemap-planner/warm
```

### Broad warm-up batch

Select the ten highest-priority matching URLs:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "sitemapUrl": "https://mageosuk.reactedge.net/sitemap.xml",
    "selection": {
      "requiredTags": ["must_be_cached"],
      "maximumTargetResponseTimeMs": 400,
      "minimumPriority": 1,
      "limit": 10
    }
  }' \
  http://localhost:8082/sitemap-planner/warm
```

Matching URLs are sorted by descending priority and then by URL so repeated
requests select the same batch. `matched` reports the number satisfying the
configuration; `selected` reports the bounded batch sent to cache-warmer.

Configuration:

- `CACHE_WARMER_URL`: delegation endpoint; defaults to
  `http://localhost:8081/cache-warmer/test-urls`.
- `CACHE_WARMER_TIMEOUT_MS`: delegation timeout; defaults to `60000`.
