# Cache warmer

Sequential cache warmer that checks platform signals before progressing to the
next URL.

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

6. From another terminal, submit exactly two URLs:

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

7. Open [Jaeger](http://localhost:16686), select `reactedge-cache-warmer` in the **Service** list, and click **Find Traces**. The request trace must contain:

   - parent span `cache_warmer.request`, with the request method, path, and response status;
   - child span `cache_warmer.test_urls` for the sequential operation;
   - `cache_warmer.load_url` for URL 1;
   - `cache_warmer.platform_status` and `cache_warmer.second_url_gate`;
   - `cache_warmer.load_url` for URL 2 only when the gate allows it.

   If the action fails, the child span has status `ERROR` and records the
   exception. The parent span then ends when the HTTP response completes.

When the first result or platform signals breach policy, the response uses
`status: "stopped"`, contains only the first result, and explains the decision
in `gate.reasons`. This is a completed safety decision, not an HTTP failure.

Stop Jaeger when finished:

```bash
docker stop reactedge-jaeger
```

## Optional configuration

- `PORT`: server port; defaults to `8081`.
- `FRONTEND_URL`: comma-separated browser origins allowed by CORS; defaults to `http://localhost:3001`.
- `CACHE_WARMER_ALLOWED_HOSTS`: comma-separated hostnames the server may fetch; defaults to `mageosuk.reactedge.net`.
- `PLATFORM_SIGNALS_STATUS_URL`: Platform Signals status endpoint; defaults to `http://127.0.0.1:8000/status`.
- `PLATFORM_SIGNALS_TIMEOUT_MS`: status request timeout; defaults to `5000`.
- `PLATFORM_MAX_CPU_PERCENT`: maximum CPU usage before stopping; defaults to `85`.
- `PLATFORM_MAX_MEMORY_PERCENT`: maximum memory usage before stopping; defaults to `85`.
- `PLATFORM_MAX_DISK_PERCENT`: maximum disk usage before stopping; defaults to `90`.
- `OTEL_HOST`: OpenTelemetry collector address; defaults to `http://localhost:4318`.
- `OTEL_CACHE_WARMER_SERVICE`: telemetry service name; defaults to `reactedge-cache-warmer`.
