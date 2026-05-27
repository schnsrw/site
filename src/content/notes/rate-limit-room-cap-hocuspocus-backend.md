---
title: 'Rate limiting and room caps for a Hocuspocus + Fastify backend'
description: 'A production-readiness pass on a Yjs realtime backend: per-route token-bucket rate limiting via @fastify/rate-limit, a MAX_ROOMS cap with two-pass LRU eviction, and a 503 capacity_full envelope. Three small pieces that turn "denial-of-service-by-loop" into "tight-but-bounded write surface."'
date: 2026-05-28
product: sheets
tags:
  - fastify
  - hocuspocus
  - rate-limiting
  - production
  - backend-hardening
  - yjs
---

A Yjs realtime backend with no rate limiting is a script's
playground. Three POST endpoints — create a room, upload a seed,
upload a snapshot — and a small loop turns into thousands of
rooms, exhausting your room registry, your Redis backing store, or
both, in minutes.

We had this exact shape. Public WebSocket gateway, three
write-side HTTP endpoints, no per-IP throttle, no upper bound on
room count. The room TTL would eventually evict idle rooms, but a
patient script could create rooms faster than the GC interval and
fill the registry to OOM. Not theoretical — the editor's live
demo at <https://sheet.schnsrw.live/> has been getting probed by
the usual web-scrapers since launch.

This post is how the
[Casual Sheets v0.2.0 production pipeline](https://github.com/schnsrw/sheets/blob/main/docs/PRODUCTION_PIPELINE.md)
hardened those three endpoints in two compact streams.

## Stream C1 — @fastify/rate-limit, per-route

The lazy way to add rate limiting on Fastify is `await
app.register(rateLimit)` and call it done — that applies a default
to every route. **Don't do that.** A noisy client throttling their
own `/health` probes looks indistinguishable from a backend
outage. You want explicit per-route opt-in.

```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: false,                       // ← opt-in per route
  keyGenerator: (req) => req.ip,       // honour trustProxy when set
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
});
```

Then on each write-side route, declare the bucket:

```typescript
app.post(
  '/api/rooms',
  {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  },
  handler,
);

app.post(
  '/api/rooms/:id/seed',
  {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  },
  handler,
);

app.post(
  '/api/rooms/:id/snapshot',
  {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  },
  handler,
);
```

Two buckets, sized differently:

- **`/api/rooms`** (60/min): room creation is cheap server-side
  but the easiest abuse vector. 60/min = 1/sec average, plenty
  for a human + their dev tools, tight enough to throttle a bot.
- **`/api/rooms/:id/seed`** + **`/snapshot`** (12/min): they take
  bytes into memory before persisting. Tighter bucket because
  each accepted request can be up to `MAX_UPLOAD_MB` of memory
  pressure.

Read endpoints (GET /snapshot, GET /info) deliberately stay
**unbounded**. Returning peers re-joining a room shouldn't get
throttled — that's the path that gets hammered by every
page-reload.

The bucket gives standard `429 + retry-after` semantics. No
custom envelope; let `@fastify/rate-limit` do its job and let
clients use the standard headers.

### Verifying the bucket actually clamps

A separate Node script (`apps/server/scripts/loadtest.ts`) drives
the four endpoints with a configurable VU count + duration. Run
it against your server with rate-limit ON and verify the bucket
hits at exactly the configured limit:

```
endpoint              count  errors   429s  p50(ms)  p95(ms)  p99(ms)
-------------------- ------- ------ -------- -------- -------- --------
POST /api/rooms         1162      0     1102      0.9      1.7      2.8
POST /seed                60      0       48      0.6      1.6      3.7
POST /snapshot            60      0       48      0.4      0.9      2.6
GET  /snapshot            60      0        0      0.3      0.7      1.6
```

From the harness:
- `/api/rooms`: 1162 attempts → 1102 throttled (60 accepted, exactly
  matching the configured 60/min for a single IP across the 1-minute
  test window).
- `/seed` + `/snapshot`: 60 attempts → 48 throttled (12 accepted,
  matching the 12/min envelope).
- `GET /snapshot`: 60 attempts → 0 throttled (correctly NOT
  rate-limited).

Zero 5xx in the run. The bucket is the only pushback, exactly as
designed.

## Stream C2 — MAX_ROOMS cap with two-pass LRU eviction

Rate-limit alone doesn't bound room count over time. A scripted
attacker rate-limited to 60 rooms/min still creates 3600 rooms/hour,
86 400 rooms/day. Without a hard cap, the room registry grows
until OOM.

The cap:

```typescript
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 256);

create(opts = {}): string {
  if (this.rooms.size >= MAX_ROOMS) {
    const evicted = this.evictLeastRecent();
    if (!evicted) {
      throw new RoomCapacityError(MAX_ROOMS);
    }
  }
  const id = makeRoomId();
  this.rooms.set(id, /* … */);
  return id;
}
```

When `create()` would push past the cap, LRU-evict the oldest
**evictable** room. "Evictable" here means **doesn't carry
user data we'd hate to lose**: no password set, no seed file
uploaded, no snapshot uploaded. Pure throwaway rooms only.

The two-pass design matters:

```typescript
private evictLeastRecent(): string | null {
  // Pass 1: prefer idle-but-evictable
  let oldestId: string | null = null;
  let oldestIdleSince = Infinity;
  for (const [id, room] of this.rooms) {
    if (!this.isEvictable(room)) continue;
    if (room.idleSince > 0 && room.idleSince < oldestIdleSince) {
      oldestIdleSince = room.idleSince;
      oldestId = id;
    }
  }
  if (oldestId) {
    this.rooms.delete(oldestId);
    this.onEvict?.(oldestId);
    return oldestId;
  }

  // Pass 2: fall back to live-but-evictable by createdAt
  let oldestCreated = '9999-99-99';
  for (const [id, room] of this.rooms) {
    if (!this.isEvictable(room)) continue;
    if (room.createdAt < oldestCreated) {
      oldestCreated = room.createdAt;
      oldestId = id;
    }
  }
  if (oldestId) {
    this.rooms.delete(oldestId);
    this.onEvict?.(oldestId);
    return oldestId;
  }

  return null;  // every slot non-evictable → caller throws
}
```

**Why two passes**, not just "pick the oldest by `createdAt`":

A naïve LRU that picks by `createdAt` alone gets defeated by a
specific attack pattern. The attacker creates 256 rooms, opens a
WebSocket to each (so `clients = 1`, no longer idle), and parks
them. Now every room is "live but no data" and the registry is
permanently full — legitimate new users see 503s forever.

The two-pass design:
- **Pass 1** picks idle-but-evictable. Idle = WebSocket closed,
  `idleSince > 0`. Under normal usage, this is plenty of supply.
- **Pass 2** activates only when *every* evictable room has live
  clients. We then kill the oldest live one by `createdAt`.

This makes the "park sockets to lock out new users" attack
unprofitable: every new attacker-created room costs them an
existing attacker-created room.

### The 503 envelope

When every slot is non-evictable (everyone has a password or
uploaded data — rare in practice, common-enough during a real
event), `create()` throws `RoomCapacityError`. The HTTP layer
maps it cleanly:

```typescript
catch (err) {
  if (err instanceof RoomCapacityError) {
    req.log.warn({ cap: err.cap }, 'room create rejected: capacity full');
    return reply
      .code(503)
      .header('retry-after', '60')
      .send({ error: 'capacity_full', cap: err.cap });
  }
  throw err;
}
```

503 + `retry-after: 60` + a structured body. The client can
distinguish "we hit the rate-limit bucket, wait 60s" (429 path)
from "the server is full, wait 60s and the operator probably needs
to scale up" (503 path).

### Eviction calls a hook

The room registry's eviction callback fires before the room is
actually deleted, so the host can also drop persisted Y.Doc bytes
in Redis:

```typescript
this.rooms.delete(oldestId);
this.onEvict?.(oldestId);
return oldestId;
```

```typescript
// In the Fastify entry:
rooms.start((evictedId) => {
  storage.delete(evictedId).catch((err) => {
    app.log.warn({ err, roomId: evictedId }, 'storage delete failed');
  });
});
```

Without this, the in-memory registry forgets the room but Redis
keeps the bytes around for the full 7-day TTL — bloat that
accumulates over months. The hook ties registry eviction to
storage cleanup so the two stay in sync.

## What this turns into

Three behaviours that didn't exist before:

1. **A single IP can't create more than 60 rooms/minute** + can't
   upload more than 12 seeds/snapshots/minute. Standard 429 +
   `retry-after`.

2. **A patient script can't push the registry past 256 rooms** —
   any further create either evicts an old idle-evictable room
   (transparent, no client-visible failure) or returns 503 with
   structured error semantics.

3. **A "park sockets to fill the registry" attack costs the
   attacker their own rooms** (pass 2 evicts the oldest live-
   evictable when no idle one is available).

All three are configurable by environment variable
(`RATE_LIMIT_PER_MIN`, `UPLOAD_RATE_LIMIT_PER_MIN`, `MAX_ROOMS`),
default to safe values, and can be disabled
(`RATE_LIMIT_ENABLED=false`) for load testing where the bucket
would mask real failures.

## What's still missing

Honest gaps:

- **Per-user rate limiting.** Today's bucket is per-IP. Behind a
  corporate NAT, 500 users share one bucket and throttle each
  other. The fix is keying the bucket by an authenticated user id
  (when present) and falling back to IP otherwise.
- **trustProxy isn't enabled by default.** If you run behind
  nginx/Caddy/Cloudflare, the bucket sees the proxy's IP, not the
  client's. You need to set Fastify's `trustProxy` option for
  per-IP buckets to mean what you'd expect.
- **The room cap is per-process.** If you horizontally scale to
  N processes, the effective cap is N × MAX_ROOMS. The room-to-
  process routing layer (sticky hash on room id) needs to bound
  its own creation rate.
- **Redis-side rate limiting** for the
  cluster case — `@fastify/rate-limit` supports a Redis backend,
  but we've only configured the in-process version. Adding it is
  one config option but worth noting we don't have it on today.

## Code

The full implementation is in
[`apps/server/src/index.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/src/index.ts)
+ [`apps/server/src/rooms.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/src/rooms.ts)
of Casual Sheets. Six unit tests pin every code path of the
two-pass eviction (idle preference, live fallback,
all-non-evictable throws, hook fires) at
[`apps/server/src/rooms.unit.test.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/src/rooms.unit.test.ts).

The load harness that verifies the bucket clamps at the configured
limits is at
[`apps/server/scripts/loadtest.ts`](https://github.com/schnsrw/sheets/blob/main/apps/server/scripts/loadtest.ts);
run it with `pnpm --filter @sheet/server load`.

---

*[Casual Sheets](/casual-sheets/) is an open-source self-hosted
spreadsheet built on Univer OSS + Yjs + Hocuspocus. Apache-2.0.
`docker run -p 3000:3000 schnsrw/casual-sheets:latest`.*
