# Cache warmer

Minimal Express skeleton for testing the cache-warmer flow one URL at a time.

## Run the happy path

Requirements: Node.js 20 or later, npm, and Docker.

1. Install dependencies and create the local environment file:

   ```bash
   npm ci
   cp .env.sample .env
   ```

2. Start Jaeger with its OpenTelemetry HTTP receiver exposed on port `4318`:

   ```bash
   docker run --detach --rm \
     --name reactedge-jaeger \
     --env COLLECTOR_OTLP_ENABLED=true \
     --publish 16686:16686 \
     --publish 4317:4317 \
     --publish 4318:4318 \
     jaegertracing/all-in-one:latest
   ```

3. Start the cache-warmer server:

   ```bash
   npm start
   ```

   The default address is `http://localhost:8080`.

4. From another terminal, call the one-URL test endpoint:

   ```bash
   curl --fail --request POST http://localhost:8080/validation/test-url
   ```

   Expected response:

   ```json
   {}
   ```

5. Open [Jaeger](http://localhost:16686), select `reactedge-cache-warmer` in the **Service** list, and click **Find Traces**.

A trace from the request confirms that the route, controller, and telemetry export are connected. The empty response does not yet prove cache warming; URL input and cache-warming behaviour will be added in the next iteration.

Stop Jaeger when finished:

```bash
docker stop reactedge-jaeger
```

## Optional configuration

- `PORT`: server port; defaults to `8080`.
- `FRONTEND_URL`: comma-separated browser origins allowed by CORS; defaults to `http://localhost:3001`.
- `OTEL_HOST`: OpenTelemetry collector address; defaults to `http://localhost:4318`.
- `OTEL_CACHE_WARMER_SERVICE`: telemetry service name; defaults to `reactedge-cache-warmer`.
