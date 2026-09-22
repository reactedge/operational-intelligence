# Cache warmer

Minimal Express skeleton for testing the cache-warmer flow one URL at a time.

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

4. Start the cache-warmer:

   ```bash
   npm start
   ```

   Runtime activity is recorded in OpenTelemetry rather than written to the
   console. No trace is created until an HTTP journey begins.

   To debug instead, open the repository root in VS Code, select **Debug cache warmer**, add a breakpoint in `TestOneUrlHandler.testUrl`, and press F5.

5. From another terminal, call the one-URL endpoint:

   ```bash
   curl -i --request POST \
     --header 'Content-Type: application/json' \
     --data '{"url":"https://mageosuk.reactedge.net/women/tops-women/jackets-women.html"}' \
     http://localhost:8081/cache-warmer/test-url
   ```

   The response must include `HTTP/1.1 200 OK` and a measured result similar to:

   ```json
   {
     "id": "requested-url",
     "label": "Requested URL",
     "url": "https://mageosuk.reactedge.net/women/tops-women/jackets-women.html",
     "status": 200,
     "durationMs": 245.3,
     "healthy": true,
     "cacheStatus": "MISS",
     "cacheHit": false
   }
   ```

   `healthy` means the target returned a successful HTTP response. A first
   warm request may legitimately report `cacheHit: false`; cache verification
   is a separate policy.

   If the response mentions Nginx, Magento, or a redirect, the request reached another service rather than the cache-warmer. Confirm that the URL uses port `8081`.

6. Open [Jaeger](http://localhost:16686), select `reactedge-cache-warmer` in the **Service** list, and click **Find Traces**. The request trace must contain:

   - parent span `cache_warmer.request`, with the request method, path, and response status;
   - child span `cache_warmer.test_url`, with `cache_warmer.target.url` set to the URL supplied above and status `OK`;
   - child span `cache_warmer.load_url`, containing the upstream HTTP, duration, and cache observations.

   If the action fails, the child span has status `ERROR` and records the
   exception. The parent span then ends when the HTTP response completes.

The HTTP response proves that `BatchLoader` fetched the configured URL. The
spans preserve the request, action, and individual URL-load boundaries that
will remain when a later iteration supplies multiple entries.

Stop Jaeger when finished:

```bash
docker stop reactedge-jaeger
```

## Optional configuration

- `PORT`: server port; defaults to `8081`.
- `FRONTEND_URL`: comma-separated browser origins allowed by CORS; defaults to `http://localhost:3001`.
- `CACHE_WARMER_ALLOWED_HOSTS`: comma-separated hostnames the server may fetch; defaults to `mageosuk.reactedge.net`.
- `OTEL_HOST`: OpenTelemetry collector address; defaults to `http://localhost:4318`.
- `OTEL_CACHE_WARMER_SERVICE`: telemetry service name; defaults to `reactedge-cache-warmer`.
