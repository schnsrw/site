---
title: 'Load testing without k6: a 190-line Node-only HTTP harness'
description: 'Before you reach for k6 or artillery, try a Node script. Built-in fetch + perf_hooks gives you p50/p95/p99 in 190 lines, zero new dependencies, and runs anywhere Node runs. Real numbers from the Casual Sheets v0.2.0 production-readiness pass.'
date: 2026-05-28
product: sheets
tags:
  - load-testing
  - node
  - fetch
  - perf
  - benchmarking
  - capacity-planning
---

The default move when you need to load-test an HTTP server: install
k6, write a JavaScript file with the k6-specific runtime, run it
from a different process, ingest the InfluxDB output, render in
Grafana, ...

For the **first round** of load testing — the round where you're
asking "does the bucket clamp where I configured it?" or "what's
the rough order-of-magnitude throughput?" — that's overkill.
Node's built-in `fetch` + `perf_hooks` gives you everything you
need.

This is what shipped as
[`apps/server/scripts/loadtest.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/scripts/loadtest.ts)
in the
[Casual Sheets v0.2.0 production-readiness pipeline](https://github.com/schnsrw/sheets/blob/main/docs/PRODUCTION_PIPELINE.md).
190 lines, zero new deps, drives 50 virtual users hammering the
write endpoints at ~1900 req/s on a laptop, with grep-friendly
output.

## The full pattern

```typescript
import { performance } from 'node:perf_hooks';

const TARGET = process.env.LOAD_TARGET ?? 'http://localhost:3000';
const VUS = Number(process.env.LOAD_VUS ?? 50);
const DURATION_S = Number(process.env.LOAD_DURATION_S ?? 60);

interface StepMetrics {
  count: number;
  errors: number;
  rateLimited: number;
  latencies: number[];
}

const metrics: Record<string, StepMetrics> = {
  'POST /api/rooms': blank(),
  'POST /seed': blank(),
  'POST /snapshot': blank(),
  'GET /snapshot': blank(),
};

async function timed(
  step: keyof typeof metrics,
  fn: () => Promise<Response>,
): Promise<Response | null> {
  const m = metrics[step];
  const start = performance.now();
  try {
    const res = await fn();
    m.count += 1;
    m.latencies.push(performance.now() - start);
    if (res.status === 429) m.rateLimited += 1;
    if (res.status >= 500) m.errors += 1;
    return res;
  } catch {
    m.count += 1;
    m.errors += 1;
    return null;
  }
}

async function virtualUser(stopAt: number): Promise<void> {
  while (performance.now() < stopAt) {
    const create = await timed('POST /api/rooms', () =>
      fetch(`${TARGET}/api/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    if (!create?.ok) {
      await sleep(250);  // backoff if rate-limited
      continue;
    }
    const { roomId } = await create.json() as { roomId: string };

    // ... three more endpoints in the same shape

    await sleep(50 + Math.random() * 100);  // inter-arrival jitter
  }
}

async function main() {
  const stopAt = performance.now() + DURATION_S * 1000;
  const vus: Promise<void>[] = [];
  for (let i = 0; i < VUS; i++) {
    const delay = (i / VUS) * 2000;  // 2-second spin-up ramp
    vus.push(sleep(delay).then(() => virtualUser(stopAt)));
  }
  await Promise.all(vus);
  printReport();
}
```

That's the heart of it. Four moving parts:

1. **`fetch` for every request** — Node 18+ ships it as a global.
   No `node-fetch`, no axios.
2. **`performance.now()` for timing** — `Date.now()` doesn't have
   sub-millisecond resolution and is wall-clock (jumps under NTP).
   `performance.now()` is monotonic and accurate.
3. **VUs as parallel async loops** — each "virtual user" is a
   `Promise<void>` doing a tight loop until `stopAt`. They run
   in parallel via the event loop; no threads needed for this
   scale.
4. **Latencies pushed into a flat array** — sort + nearest-rank
   percentile at the end.

That's it. Nothing exotic.

## The percentile math

```typescript
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

function report(label: string, m: StepMetrics) {
  const sorted = [...m.latencies].sort((a, b) => a - b);
  return [
    label.padEnd(20),
    String(m.count).padStart(7),
    String(m.errors).padStart(6),
    String(m.rateLimited).padStart(8),
    percentile(sorted, 50).toFixed(1).padStart(8),
    percentile(sorted, 95).toFixed(1).padStart(8),
    percentile(sorted, 99).toFixed(1).padStart(8),
  ].join(' ');
}
```

Nearest-rank percentile. Small samples don't deserve linear
interpolation. If you have 100 samples, p99 = the 99th sorted
value. Done.

## The output format

```
endpoint              count  errors   429s  p50(ms)  p95(ms)  p99(ms)
-------------------- ------- ------ -------- -------- -------- --------
POST /api/rooms         9519      0        0      0.2      0.6      1.6
POST /seed              9519      0        0      0.2      0.6      2.1
POST /snapshot          9519      0        0      0.2      0.5      1.9
GET /snapshot           9519      0        0      0.2      0.5      1.7

totals: 38 076 requests, 0 errors, 0 rate-limited, 1903.8 req/s avg
```

Fixed-width columns. **Grep-friendly.** No JSON, no InfluxDB schema,
no Grafana dashboard. If you want CI to gate on p99, awk the
column. If you want a chart, copy-paste into Numbers or Google
Sheets.

The "grep-friendly" property matters more than it sounds. The
moment you need a custom output format ("we want JSON to feed into
our pipeline"), you can build it on top of this structure with a
3-line change. The moment you start with k6's structured output,
you're locked into k6's schema.

## Real numbers it produced

The harness drove three runs against the
[Casual Sheets backend](https://github.com/schnsrw/sheets)
during the v0.2.0 production-readiness pass:

**Run 1 — baseline (rate-limit DISABLED, 50 VUs × 20 s):**
- ~1900 req/s aggregate
- p99 < 3 ms across all four write endpoints
- Zero 5xx errors

**Run 2 — rate-limit verification (defaults ON, 20 VUs × 15 s):**
- 1162 attempts on `/api/rooms` → 1102 throttled (60 accepted =
  exactly the configured 60/min for a single IP)
- 60 attempts each on `/seed` + `/snapshot` → 48 throttled (12
  accepted = exactly the configured 12/min)
- Zero 5xx errors; the bucket is the only pushback

The harness was designed for this second run specifically. The
question "does my rate-limit bucket clamp at the configured
limit?" is way easier to answer with a 190-line script you wrote
yourself than with a 5000-line k6 setup you have to learn.

## When to upgrade to k6

The Node-only harness is the right call when:

- **You need numbers, not a dashboard.** First-round capacity
  measurement, "does this config work" verification, regression
  baselining.
- **You don't want a dependency.** No `node-fetch`, no k6 binary
  install, no Docker image to maintain.
- **Your team reads JavaScript.** k6's runtime is a custom
  JavaScript variant — not Node, not Deno, not the browser. Your
  TypeScript / Node knowledge mostly transfers but the imports +
  globals differ. The Node-only harness is just Node.
- **You're already in the Node ecosystem.** The whole backend is
  Fastify? Run the harness in the same workspace, share types
  between the harness and the server, debug both in the same
  IDE.

**Upgrade to k6 when:**
- You need distributed load (one machine isn't enough VUs).
- You need executors more sophisticated than "N parallel async
  loops" (ramping arrival rates, constant arrival rate with
  variable VUs, etc.).
- You need ingestion into a metrics pipeline for trending across
  many runs over time.
- You need a single source of truth for "what does the load test
  do" across multiple teams.

For your first 100 load tests, the Node-only harness will be
fine. Past that, k6 starts earning its weight.

## What the harness deliberately doesn't do

A few things I'd implement in a "real" harness but skipped here:

- **No structured output.** Adding `--json` is a 10-line change
  but YAGNI for the use case (verifying bucket behaviour, not
  feeding a metrics pipeline).
- **No ramping schedules.** Spin-up is staggered linearly across
  2 seconds and that's it. k6's complex VU schedules don't fit
  the questions we were answering.
- **No coordinated arrival rate.** Each VU is a tight loop with
  ~75 ms inter-arrival jitter; if requests slow down, the VU
  slows down too (closed-loop). Real production has open-loop
  arrivals where requests pile up if the server can't keep up.
  For broadly characterising "does it work," the closed-loop
  shape is fine.
- **No HTML report generation.** The grep-friendly output IS
  the report.
- **Single source IP.** All VUs share the harness's IP, so
  per-IP rate-limit testing simulates one attacker with many
  parallel requests, not many attackers each with a few. A
  multi-IP test needs something more elaborate.

These are all reasonable to add when you need them. None of them
are needed for the first round.

## The broader lesson

Most "we need a load test" requests resolve to "we need numbers
for a specific question." For most specific questions, a script
you write yourself gives you a more useful answer faster than
a heavyweight framework.

Default to the script. Add the framework when the script is the
bottleneck.

## How to run it

The full harness is at
[`apps/server/scripts/loadtest.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/scripts/loadtest.ts)
of [Casual Sheets](/casual-sheets/). The script command:

```bash
# Default — 50 VUs × 60 s against localhost:3000
pnpm --filter @sheet/server load

# Override env
LOAD_TARGET=https://your-server LOAD_VUS=100 LOAD_DURATION_S=120 \
  pnpm --filter @sheet/server load
```

For raw-capacity numbers without the rate-limit bucket in the way:

```bash
RATE_LIMIT_ENABLED=false MAX_ROOMS=10000 pnpm --filter @sheet/server dev
# in another shell:
pnpm --filter @sheet/server load
```

Pair this post with
[Measuring the WebSocket broadcast ceiling](/notes/websocket-broadcast-ceiling-single-node-process/) —
that one drives the WS sync path with the same Node-script
pattern (using `@hocuspocus/provider` instead of `fetch`).

---

*[Casual Sheets](/casual-sheets/) is an open-source self-hosted
spreadsheet built on Univer OSS + Yjs + Hocuspocus. Apache-2.0.*
