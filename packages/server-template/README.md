# __SERVICE_NAME__

Generated Express service with request-scoped OpenTelemetry tracing.

## Run

```bash
cp .env.sample .env
npm install
npm start
```

Verify the example route:

```bash
curl --fail http://localhost:__SERVER_PORT____ROUTE_PREFIX__/status
```

The trace contains a `__SPAN_PREFIX__.request` parent span and a
`__SPAN_PREFIX__.status` route span.
