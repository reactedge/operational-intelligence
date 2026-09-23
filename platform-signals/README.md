# Platform Signals

Platform Signals exposes host-level operational signals through a lightweight REST API.

The service is intended to run alongside the platform it observes and provides read-only access to system signals. It does not assess platform health or perform remediation.

---

## Run with Docker Compose

```bash
cd platform-signals
cp .env.sample .env
docker compose up --build --force-recreate
```

The Compose file connects to the existing `mageos_network` Docker network. If
that network does not exist, start the local Magento stack first or create the
network explicitly.

Verify the service:

```bash
curl --fail http://127.0.0.1:8000/status
```

The response contains platform identity and all signals consumed by
cache-warmer:

```json
{
  "timestamp": "2026-09-23T12:00:00Z",
  "platform": {
    "hostname": "localhost",
    "environment": "development",
    "service": "platform-signals",
    "version": "0.1.0"
  },
  "signals": {
    "cpu": {"usagePercent": 10},
    "memory": {"usagePercent": 50},
    "disk": {"usagePercent": 60},
    "redis": {"connected": true},
    "varnish": {"connected": true}
  }
}
```

Disconnected Redis or Varnish is still a valid observation. Cache-warmer uses
it as a reason to stop before processing the next URL.

---

## Run Tests

```bash
pytest
```

or

```bash
docker run -it \
  -v $(pwd):/app \
  -w /app \
  platform-signals \
  pytest -s
```

---

## Responsibility

Platform Signals reports observations only:

- CPU usage
- Memory usage
- Disk usage
- Redis
- Varnish

It does not classify the platform as healthy and does not perform remediation.
The cache-warmer safety policy consumes these observations and decides whether
another URL may be requested.
