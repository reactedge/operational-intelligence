# Cache warmer

Sequential cache warmer that processes one bounded batch and then checks
platform signals before another batch may start.

## Run and verify the happy path

Requirements: Node.js 20 or later, npm, and Docker.

1. From the repository root, enter the service directory, install dependencies, and create the local environment file:

   ```bash
   cd cache-warmer
   npm ci
   cp .env.sample .env
   ```

2. Confirm that the cache-warmer port is free before starting it:

   ```bash
   ss -ltnp | grep ':8081'
   ```

   No output is expected. Port `8081` is used because the local Magento Nginx service already occupies port `8080`.

3. Start Jaeger with its OpenTelemetry HTTP receiver exposed on port `4318`:

   ```bash
   docker run --detach --rm \
     --name reactedge-jaeger \
     --env COLLECTOR_OTLP_ENABLED=true \
     --publish 16686:16686 \
     --publish 4317:4317 \
     --publish 4318:4318 \
     jaegertracing/all-in-one:latest
   ```

4. Start the Platform Signals service and verify its status contract:

   ```bash
   curl --fail http://127.0.0.1:8000/status
   ```

   The response must contain `cpu`, `memory`, `disk`, `redis`, and `varnish`
   under `signals`.

5. Start the cache-warmer:

   ```bash
   npm start
   ```

   Runtime activity is recorded in OpenTelemetry rather than written to the
   console. No trace is created until an HTTP journey begins.

   To debug instead, open the repository root in VS Code, select **Debug cache warmer**, add a breakpoint in `TestOneUrlHandler.testUrl`, and press F5.

6. From another terminal, submit a batch of between one and ten URLs. Ten is
   the current explicit safety bound for a batch, not an HTTP limitation:

   ```bash
   curl -i --request POST \
     --header 'Content-Type: application/json' \
     --data '{"urls":["https://mageosuk.reactedge.net/women/tops-women/jackets-women.html","https://mageosuk.reactedge.net/women/tops-women/coats-women.html"]}' \
     http://localhost:8081/cache-warmer/test-urls
   ```

   The response must include `HTTP/1.1 200 OK` and a measured result similar to:

   ```json
   {
     "status": "completed",
     "results": [
       {"id": "url-1", "status": 200, "healthy": true},
       {"id": "url-2", "status": 200, "healthy": true}
     ],
     "gate": {"allowed": true, "reasons": []},
     "platform": {"signals": {}}
   }
   ```

   `healthy` means the target returned a successful HTTP response. A first
   warm request may legitimately report `cacheHit: false`; cache verification
   is a separate policy.

   If the response mentions Nginx, Magento, or a redirect, the request reached another service rather than the cache-warmer. Confirm that the URL uses port `8081`.

7. Open Jaeger at `http://localhost:16686`, select `reactedge-cache-warmer` in the **Service** list, and click **Find Traces**. The request trace must contain:

   - parent span `cache_warmer.request`, with the request method, path, and response status;
   - child span `cache_warmer.test_urls` for the sequential operation;
   - `cache_warmer.load_url` for URL 1;
   - one `cache_warmer.platform_status` after all submitted URLs;
   - one `cache_warmer.next_batch_gate` containing the decision for a future
     batch.

   If the action fails, the child span has status `ERROR` and records the
   exception. The parent span then ends when the HTTP response completes.

Every URL in the submitted batch is attempted before Platform Signals is read.
The response uses `status: "completed"` and includes every result. When a URL
failed or the post-batch signals breach policy, `gate.allowed` is false and
`gate.reasons` explains why another batch must not start. This is a completed
safety decision, not an HTTP failure.

## Continuous sitemap worker

The worker is disabled by default. To enable it for development, set:

```bash
CACHE_WARMER_WORKER_ENABLED=true
CACHE_WARMER_SITEMAP_URL=https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml
CACHE_WARMER_MINIMUM_PRIORITY=0.5
CACHE_WARMER_BATCH_SIZE=5
```

The development sitemap above is preferred for worker testing. The public demo sitemap is `https://mageosuk.reactedge.net/sitemap.xml`, but worker development should not depend on the live demo site.

When enabled, the worker:

```text
fetch sitemap
→ select URLs by priority
→ check platform capacity
→ warm one batch
→ check capacity again
→ continue or defer
```

If the platform is saturated, the worker records the next offset, waits for `CACHE_WARMER_DEFER_RETRY_MS`, then resumes from the remaining selected URLs. After a complete cycle it waits for `CACHE_WARMER_CYCLE_INTERVAL_MS` before starting a new sitemap cycle.

Worker activity is emitted through OpenTelemetry, including `cache_warmer.worker.started`, `cache_warmer.capacity.checked`, `cache_warmer.worker.deferred`, `cache_warmer.worker.cycle.completed`, and per-URL warming observations.

Run the deterministic unit and end-to-end validation before enabling the worker:

```bash
npm test
```

The end-to-end test uses a local 40-URL sitemap fixture and real local HTTP requests, so it does not require Magento, Jaeger, or the live development sitemap.

Stop Jaeger when finished:

```bash
docker stop reactedge-jaeger
```

## Optional configuration

- `PORT`: server port; defaults to `8081`.
- `FRONTEND_URL`: comma-separated browser origins allowed by CORS; defaults to `http://localhost:3001`.
- `CACHE_WARMER_ALLOWED_HOSTS`: comma-separated hostnames the server may fetch.
- `CACHE_WARMER_WORKER_ENABLED`: enables the continuous sitemap worker; defaults to `false`.
- `CACHE_WARMER_SITEMAP_URL`: sitemap used by the worker; defaults to the MageOS development sitemap.
- `CACHE_WARMER_MINIMUM_PRIORITY`: minimum sitemap priority selected for warming; defaults to `0.5`.
- `CACHE_WARMER_BATCH_SIZE`: selected URLs warmed before the next capacity check; defaults to `5`.
- `CACHE_WARMER_CYCLE_INTERVAL_MS`: delay after a completed sitemap cycle; defaults to `300000`.
- `CACHE_WARMER_DEFER_RETRY_MS`: delay before retrying deferred work; defaults to `30000`.
- `PLATFORM_SIGNALS_STATUS_URL`: Platform Signals status endpoint; defaults to `http://127.0.0.1:8000/status`.
- `PLATFORM_SIGNALS_TIMEOUT_MS`: status request timeout; defaults to `5000`.
- `PLATFORM_MAX_CPU_PERCENT`: maximum CPU usage before deferring; defaults to `85`.
- `PLATFORM_MAX_MEMORY_PERCENT`: maximum memory usage before deferring; defaults to `85`.
- `PLATFORM_MAX_DISK_PERCENT`: maximum disk usage before deferring; defaults to `90`.
- `OTEL_HOST`: OpenTelemetry collector address; defaults to `http://localhost:4318`.
- `OTEL_CACHE_WARMER_SERVICE`: telemetry service name; defaults to `reactedge-cache-warmer`.
