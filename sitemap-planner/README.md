# Sitemap Planner

Transforms a remote sitemap into a cache-planning contract with request-scoped
OpenTelemetry tracing. It can either return the complete plan or select a
bounded subset and synchronously delegate it to cache-warmer.

For the full multi-service startup and verification journey, see the
repository root README.

## Boundaries

Sitemap Planner owns sitemap fetching, planning metadata, filtering, and
ranking. It does not measure page response times or decide whether the platform
is safe. Those responsibilities belong to cache-warmer and Platform Signals.

The service currently supports sitemap URL sets (`<urlset>`), not sitemap
indexes (`<sitemapindex>`).

## Run

```bash
cp .env.sample .env
npm install
NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/caddy-root.crt npm run dev
```

Verify the example route:

```bash
curl --fail http://localhost:8082/sitemap-planner/status
```

Create a plan:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{"sitemapUrl":"https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml"}' \
  http://localhost:8082/sitemap-planner/plan
```

In this first iteration, every URL receives the same baseline cache policy:

- `mustBeCached: true`;
- `targetResponseTimeMs: 200`;
- a priority from 1 to 5;
- tags expressing the cache, response-time and priority requirements.

This does not yet classify which URLs truly require caching. A later policy
layer is expected to derive `mustBeCached` and the response-time target from
URL/store rules. The current uniform policy lets selection, batching,
delegation, and observability be validated first.

The sitemap protocol defines `<priority>` from `0.0` to `1.0`; it is mapped to
the internal integer range `1..5`. Values outside the protocol range are
clamped defensively. When priority is absent, shallower paths receive a higher
priority.

The planning trace contains `sitemap_planner.request`, `sitemap_planner.plan`,
`sitemap_planner.fetch_sitemap`, and `sitemap_planner.transform` spans.

## Select and warm URLs

`POST /sitemap-planner/warm` builds the tagged plan internally, selects at
most ten matching URLs, and delegates that bounded batch to cache-warmer.
Selection is supplied with each request rather than hard-coded in the service.

The `targetResponseTimeMs` value is a target used for selection. The cache
warmer's result contains the measured duration; the target is not presented as
an observed response time.

Start Platform Signals on port `8000` and cache-warmer on port `8081`, then
choose one of these configurations. The request remains open until
cache-warmer completes the selected batch and returns its next-batch gate.

### Critical pages

Select two priority-5 pages with a target no slower than 200 ms:

```bash
curl --fail --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "sitemapUrl": "https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml",
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
    "sitemapUrl": "https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml",
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
    "sitemapUrl": "https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml",
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
`limit` is the requested batch size. The current implementation accepts 1–10;
the upper bound comes from the initial cache-warming safety requirement and is
not a transport limitation.

Configuration:

- `CACHE_WARMER_URL`: delegation endpoint; defaults to
  `http://localhost:8081/cache-warmer/test-urls`.
- `CACHE_WARMER_TIMEOUT_MS`: delegation timeout; defaults to `60000`.

## Confirm that it works

1. `GET /sitemap-planner/status` returns `{"status":"ok"}`.
2. `POST /sitemap-planner/plan` returns the fetched sitemap URL, a count, and
   planned entries without calling cache-warmer.
3. `POST /sitemap-planner/warm` returns only the selected entries and a
   `cacheWarmer` result.
4. Jaeger lists `reactedge-sitemap-planner` and shows fetch, transform, select,
   and delegation child spans for the `/warm` request.

During diagnosis, use `curl -i` instead of `curl --fail`; otherwise curl hides
the JSON body that explains an HTTP error.

If Node reports `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, the process was not
started with the local Caddy CA. Confirm the trust independently:

```bash
NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/caddy-root.crt \
node -e "fetch('https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml').then(r => console.log(r.status)).catch(e => console.error(e.cause ?? e))"
```

Expected output: `200`.
