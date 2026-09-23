# End-to-end cache-warming flow

This document separates the development journey that can be run today from
the durable worker journey that is still to be implemented. Each step names a
deliverable that can be inspected before proceeding.

## Development journey available now

This journey is synchronous and intended to prove integration between sitemap
planning, URL selection, cache warming, Platform Signals, and telemetry. It
does not create a persistent job and cannot resume after interruption.

### Prerequisites

Start Jaeger, Platform Signals, cache-warmer, and sitemap-planner by following
the root README. The local Magento store and sitemap must also be reachable.

| Step | Action | Checkable deliverable |
| --- | --- | --- |
| 1. Check the target | Fetch the development sitemap with Node using the local Caddy CA. | HTTP `200` from `https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml`. |
| 2. Check Platform Signals | Call `GET http://127.0.0.1:8000/status`. | A response containing CPU, memory, disk, Redis, and Varnish signals. |
| 3. Check cache-warmer | Confirm port `8081` is listening; optionally submit a small URL batch directly. | HTTP `200`, one measured result per URL, and a post-batch `gate` decision. |
| 4. Check sitemap-planner | Call `GET http://localhost:8082/sitemap-planner/status`. | `{"status":"ok"}`. |
| 5. Build a plan only | Call `POST /sitemap-planner/plan`. | The sitemap URL, total count, and complete planned-entry array. Cache-warmer is not called. |
| 6. Run the development journey | Call `POST /sitemap-planner/dev-warm` with selection configuration. | Only the selected entries, measured cache-warmer results, Platform Signals, and the next-batch gate. |
| 7. Check planner telemetry | Find the `reactedge-sitemap-planner` trace in Jaeger. | Request, development orchestration, fetch, transform, select, and delegation spans. |
| 8. Check warmer telemetry | Find the `reactedge-cache-warmer` trace in Jaeger. | One load span per selected URL followed by platform-status and next-batch-gate spans. |

### Plan-only request

```bash
curl -i --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "sitemapUrl": "https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml"
  }' \
  http://localhost:8082/sitemap-planner/plan
```

The deliverable is an in-memory plan returned in the HTTP response. It is not
stored and does not represent a resumable job.

### Development plan-and-warm request

```bash
curl -i --request POST \
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
  http://localhost:8082/sitemap-planner/dev-warm
```

The endpoint name deliberately contains `dev`: it refetches and replans the
sitemap on every call, processes only one batch, holds the HTTP request open,
and persists nothing.

## Durable worker journey to implement

The worker must create one plan snapshot and consume it in batches. It must not
refetch and replan the sitemap for every batch because doing so can duplicate,
omit, or reorder work when the sitemap changes.

| Step | Worker action | Persistent/checkable deliverable |
| --- | --- | --- |
| 1. Create job | Accept the sitemap URL, selection policy, and batch size. | A job ID with status `planning` and the immutable input configuration. |
| 2. Create plan snapshot | Fetch, parse, tag, filter, and rank the sitemap once. | Ordered URL records associated with the job, plus total count and optional plan hash. |
| 3. Initial safety check | Read Platform Signals before the first batch. | A stored preflight decision; the job becomes `ready` or `paused`. |
| 4. Queue work | Enqueue the job ID, not the full URL payload. | A queue entry that can be retried without recreating the plan. |
| 5. Claim a batch | Atomically claim the next pending URL records using the configured batch size. | Claimed records move from `pending` to `processing`; attempt number and worker lease are stored. |
| 6. Warm the batch | Send the claimed URLs to cache-warmer. | One measured result per URL and a post-batch `gate` decision. |
| 7. Checkpoint results | Persist URL outcomes and the job cursor in one recoverable operation. | URLs become `completed` or `failed`; processed and remaining counts are queryable. |
| 8. Decide progression | Evaluate the returned gate and whether pending URLs remain. | Job becomes `queued`, `paused`, `completed`, or `failed`, with an explicit reason. |
| 9. Continue | When allowed, enqueue the same job ID for its next batch. | A new queue entry references the existing plan; no new sitemap plan is created. |
| 10. Resume safely | Recover expired `processing` leases after a crash or restart. | Work resumes from persisted URL state without silently losing entries. |

## Minimum persistent contracts

### Job

```json
{
  "id": "job-123",
  "status": "running",
  "sitemapUrl": "https://mageos-docker.magsite.co.uk/media/sitemap/uk.xml",
  "selection": {
    "requiredTags": ["must_be_cached"],
    "maximumTargetResponseTimeMs": 400,
    "minimumPriority": 1
  },
  "batchSize": 5,
  "totalUrls": 40,
  "processedUrls": 10,
  "nextBatchAllowed": true
}
```

### Planned URL

```json
{
  "jobId": "job-123",
  "position": 11,
  "url": "https://example.com/product.html",
  "priority": 4,
  "status": "pending",
  "attempts": 0,
  "result": null
}
```

The URL status transition is:

```text
pending -> processing -> completed
                      -> failed
```

The persistence boundary is essential: a batch is not complete until its URL
results and job progress have been stored. Queue acknowledgement must happen
after that checkpoint so a worker crash can be retried safely.

## Role of the development endpoint after the worker exists

`POST /sitemap-planner/dev-warm` can remain as a small integration diagnostic.
The worker must not call it. The worker should load its persisted plan, claim a
batch, and call cache-warmer directly.
