# Cache warmer

Minimal Express skeleton for testing the cache-warmer flow one URL at a time.

## Run the happy path

Requirements: Node.js 20 or later and npm.

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Start the server:

   ```bash
   npm start
   ```

   The default address is `http://localhost:8080`.

3. From another terminal, call the one-URL test endpoint:

   ```bash
   curl --fail --request POST http://localhost:8080/validation/test-url
   ```

   Expected response:

   ```json
   {}
   ```

This empty response confirms that the route, controller, and telemetry lifecycle are connected. Cache warming and URL input will be added in the next iteration.

## Optional configuration

- `PORT`: server port; defaults to `8080`.
- `FRONTEND_URL`: comma-separated browser origins allowed by CORS; defaults to `http://localhost:3001`.
- `OTEL_HOST`: OpenTelemetry collector address; defaults to `http://localhost:4318`.
- `OTEL_CACHE_WARMER_SERVICE`: telemetry service name; defaults to `reactedge-cache-warmer`.
