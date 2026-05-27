---
title: 'Measuring the WebSocket broadcast ceiling of a single Node process'
description: 'We modelled the broadcast ceiling of a Hocuspocus + Yjs CRDT backend at ~500 active docs per Node process. Then we measured it. The model was 10× too conservative — the real bottleneck is somewhere else entirely.'
date: 2026-05-28
product: sheets
tags:
  - hocuspocus
  - yjs
  - websocket
  - load-testing
  - capacity-planning
  - node
---

We had a capacity model. It said: a single Node process running Yjs +
Hocuspocus tops out around 500 active documents because the broadcast
loop is single-threaded and p99 latency climbs above the 50 ms comfort
threshold past that point.

We had not actually measured this.

When [Casual Sheets v0.2.0](/changelog/sheets-v020/) shipped, the
[capacity model doc](https://github.com/schnsrw/sheets/blob/main/docs/CAPACITY_MODEL.md)
sized everything from this 500-doc ceiling. Five deployment tiers,
dollar estimates, sharding triggers — all anchored to a number we'd
calculated from first principles but never run a wire on.

Then we built the harness. The number was wrong.

## The harness

`apps/server/scripts/wsloadtest.ts` (~250 LOC, no new deps). Each
virtual user is a real `@hocuspocus/provider` instance running in
Node. Same WebSocket handshake, same Yjs sync protocol, same
awareness mechanics as a browser would do. The provider does need
a `ws` polyfill (passed as `WebSocketPolyfill` on the
`HocuspocusProviderWebsocket` constructor) — Node's native
`WebSocket` works on 22+ but the npm `ws` package gives consistent
behaviour across the supported versions.

Each room gets N clients (default 3). One writer per room pushes a
**beacon record** to the Yjs op-log every `WRITE_INTERVAL_MS` ms.
The beacon carries a sender-side `performance.now()` timestamp.
Readers observe the log and compute `now - sentAt` as broadcast
latency. Sequence numbers detect drops.

The trick: we capture the latency in the **observe handler on a
peer**, using `performance.now()` from the same Node process the
writer ran in. No clock-sync problem; both timestamps come from one
monotonic clock.

## The numbers

Three runs, ramping toward the model's stated ceiling.

### Run 1 — co-edit baseline (50 rooms × 3 clients × 30 s = 150 WS)

```
metric                   count errors  p50(ms)  p95(ms)  p99(ms)
---------------------- ------- ------ -------- -------- --------
WS connect + sync          150      0      2.3      5.5      7.4
Broadcast latency         1420      0      1.1      2.4      3.4

totals: 47.3 updates/s aggregate, 0 dropped records
```

Quiet, well below anything we'd worry about. Connect setup p99 7 ms,
broadcast p99 3.4 ms.

### Run 2 — Tier L (200 rooms × 3 = 600 WS)

```
metric                   count errors  p50(ms)  p95(ms)  p99(ms)
---------------------- ------- ------ -------- -------- --------
WS connect + sync          600      0      1.6      2.8      4.6
Broadcast latency         5200      0      0.4      0.9      1.7

totals: 173.3 updates/s aggregate, 0 dropped records
```

600 concurrent WS, sustained 173 updates per second, broadcast p99
**1.7 ms**. *Lower* than the 150-WS run — more samples amortise the
percentile.

This was the first hint the model was wrong. At Tier L the model
predicted noticeable latency creep; reality showed essentially flat
broadcast time.

### Run 3 — model's stated ceiling (500 rooms × 3 = 1500 WS)

```
metric                   count errors  p50(ms)  p95(ms)  p99(ms)
---------------------- ------- ------ -------- -------- --------
WS connect + sync         1500      0      2.0      6.4     16.3
Broadcast latency        10500      0      0.3      1.4      3.2

totals: 350 updates/s aggregate, 0 dropped records
```

**1500 concurrent WebSocket clients on a single Node process.
Sustained 350 updates per second. Broadcast p99: 3.2 ms. Zero
dropped records over 30 seconds.**

The model predicted this would be the latency knee. Real p99 was
~10× lower than the threshold (3.2 ms vs the 50 ms ceiling we'd
called out). The broadcast loop on a single thread has **substantially
more headroom than the model assumed.**

## Why the model was wrong

The model assumed broadcast cost grew linearly with fan-out — `N
peers per room × M rooms`. That's true in raw FLOPs, but each
broadcast is microseconds of work (`ws.send(buffer)` plus a small
Yjs encode). At 1500 clients × 350 updates/s = ~500 000
client-broadcasts/sec, we're using a few percent of one CPU core.

The bottleneck the model anchored on doesn't exist at this scale on
modern Node. There's a *real* bottleneck — but it's not broadcast
CPU.

## Where the real bottleneck lives

We re-ordered the capacity model's failure list. The new order, from
most-likely-to-hit-first to least:

1. **File descriptor cap.** Linux default 1024 per process. You'll
   hit a wall at exactly 1024 concurrent WebSocket connections with
   no useful error message — just mysterious connection failures.
   Set `ulimit -n 65535` in the systemd unit (or
   `--ulimit nofile=65535:65535` on Docker). Non-negotiable.
2. **RAM for active docs.** ~370 KB per active document state
   (Y.Doc + Hocuspocus session + ws send buffer + room registry
   record). 5 000 active docs fit in ~2 GB. This *is* a real
   ceiling, just much higher than the broadcast knee.
3. **Redis colocation.** If Redis runs on the same box for Y.Doc
   persistence, it competes for the same RAM. Co-host up to ~8 000
   active docs; past that, move Redis to its own machine.
4. **Compaction CPU spikes.** Each doc compacts on a designated
   writer every 7–60 minutes; if many docs compact in the same
   second, you'll see a brief CPU spike. Existing
   `COMPACT_MIN_INTERVAL_MS` jitters this naturally.
5. **CPU pegging on the broadcast loop.** *Wasn't approached* even
   at 1500 concurrent WS × 350 updates/s. Probably starts mattering
   somewhere north of 5 000 active rooms with sustained write rates.
6. **Network egress.** Negligible until 10k+ docs.

The model now reflects this measured ordering rather than the
hypothetical one.

## What this means for sizing

The 1-user-per-doc workload (true single-player editor with cloud
persistence — no broadcast fan-out at all) is even more generous.
A `$48`/mo DigitalOcean General Purpose droplet (4 vCPU / 8 GB /
180 SSD) realistically serves **5 000–8 000 concurrent users**
single-process. With Node cluster mode and sticky room-to-worker
routing, **10 000–15 000**. The full breakdown is in the
[capacity model](https://github.com/schnsrw/sheets/blob/main/docs/CAPACITY_MODEL.md)
including a worked example for that exact droplet.

For the more realistic 2–5-users-per-doc co-edit workload, the
ceiling is bounded by RAM (active doc state) at ~500 active docs
per process on a typical 1–2 GB allocation. Not bounded by
broadcast CPU like the model originally claimed.

## How to reproduce

The harness is in-tree at
[`apps/server/scripts/wsloadtest.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/scripts/wsloadtest.ts).
Configurable via env:

```bash
# Default: 20 rooms × 3 clients × 60 s
pnpm --filter @sheet/server wsload

# Reproduce the run-3 ceiling test
LOAD_ROOMS=500 LOAD_CLIENTS_PER_ROOM=3 LOAD_DURATION_S=30 \
  LOAD_WRITE_INTERVAL_MS=2000 LOAD_SPIN_UP_MS=20000 \
  pnpm --filter @sheet/server wsload

# For raw capacity numbers (no rate-limit bucket in the way):
RATE_LIMIT_ENABLED=false MAX_ROOMS=10000 \
  pnpm --filter @sheet/server dev
# then run the loadtest from another shell
```

The harness uses Node's built-in `fetch` + `perf_hooks` — no k6 or
artillery install. Output is fixed-width and grep-friendly so CI
can extract the p99 numbers later if we want a regression gate.

## The lesson

I'm not the first person to learn this. Andy Pavlo
[has been saying for years](https://www.youtube.com/watch?v=XCs2RQbjqIA)
that database benchmark "models" without measured numbers are
mostly fiction. Same shape here. Our model was carefully reasoned
from first principles — fan-out math, event-loop assumptions,
heuristics about WebSocket send-queue contention — and it was
wrong by an order of magnitude.

**Build the harness before you trust the model.** Even a sloppy
harness gives ground truth. A perfectly-reasoned model without a
measurement is a story.

---

*[Casual Sheets](/casual-sheets/) is an open-source self-hosted
spreadsheet — `docker run -p 3000:3000 schnsrw/casual-sheets:latest`
to try. Apache-2.0. Full numbers + tier breakdown in the
[capacity model](https://github.com/schnsrw/sheets/blob/main/docs/CAPACITY_MODEL.md).*
