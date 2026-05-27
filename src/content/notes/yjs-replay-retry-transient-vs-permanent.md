---
title: 'Yjs replay retry: classifying transient vs permanent failures in a CRDT bridge'
description: 'When a Yjs CRDT bridge fails to apply a remote mutation, the difference between "network blip during chunk-load" and "malformed mutation params" matters a lot. We added a 50-line classifier and a 4-second retry budget. Silent divergences became user-visible recoverable state.'
date: 2026-05-28
product: sheets
tags:
  - yjs
  - hocuspocus
  - crdt
  - error-handling
  - collaborative-editing
  - production
---

In a Yjs + Hocuspocus collaborative editor, the replay loop on each
peer is where remote mutations become local state. Something arrives
in the op log (`Y.Array.observe`), you dispatch
`cmdSvc.executeCommand(rec.id, params, { fromCollab: true })`, your
local state moves to match the sender's.

Before this fix, our error handler was:

```typescript
.catch((err) => {
  console.warn('[collab] replay failed for', rec.id, err);
  noteReplayFailure();  // increments a counter
});
```

`noteReplayFailure` just bumped a counter, surfaced eventually in
the UI as "N edits from peers couldn't be applied to your view —
refresh to resync." A real warning! But every replay failure looked
the same to it. That conflation was the bug.

## Two kinds of failure

Mutations fail for very different reasons:

**Transient failures:**
- Webpack chunk-load failed during the lazy-plugin gate
- "Loading chunk 42 failed" from the bundler
- Vite's "Failed to fetch dynamically imported module"
- NetworkError on a flaky connection

These are network or bundler hiccups. **Retry once the network
recovers and the mutation lands cleanly.** The state the mutation
describes is still valid — the chunk just wasn't ready.

**Permanent failures:**
- Mutation params don't match the registered command's expected
  shape (e.g., `params.value` is undefined)
- The mutation references a sheet/range that doesn't exist locally
- Unknown command id (sender ran a plugin version we don't have)

These will fail the same way every time. **Retrying just re-throws
the same stack trace.** Burning the retry budget here is wasted
attempts that delay the dead-letter.

Pre-fix, both classes hit the same `noteReplayFailure()` and got
the same "refresh to resync" treatment. Transients incremented a
counter forever because they never got a second chance. Permanents
incremented the counter forever because they couldn't be fixed
without code changes.

## The 50-line classifier

```typescript
export function classifyReplayError(err: unknown): 'transient' | 'permanent' {
  if (err == null) return 'permanent';

  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : String(err);

  // ChunkLoadError sets .name even though it's not on stock Error
  if (name === 'ChunkLoadError') return 'transient';

  const lower = message.toLowerCase();
  if (lower.includes('loading chunk') && lower.includes('failed')) return 'transient';
  if (lower.includes('failed to fetch dynamically imported')) return 'transient';
  if (lower.includes('networkerror when attempting to fetch')) return 'transient';
  if (lower.includes('network request failed')) return 'transient';

  return 'permanent';
}
```

Five rules. Conservative bias: when in doubt, return `'permanent'`.
A false negative costs us a dead-letter entry the user can recover
from with a refresh; a false positive wastes 4 seconds of retries
on a known-broken mutation. The cost asymmetry favours conservative.

The five rules cover what we've actually seen in the wild. Webpack
5 sets `name === 'ChunkLoadError'`; webpack 4 and Vite both throw
`Error('Loading chunk N failed')` shaped messages but don't set a
distinctive name. Native ESM dynamic-import failures land as
`Failed to fetch dynamically imported module`. The fetch wrappers
add `NetworkError when attempting to fetch` and `Network request
failed`. That's the full transient set we trust today.

Anything else — TypeError from bad params, application errors from
the command handler, custom Error subclasses we haven't catalogued —
is permanent until proven otherwise.

## The retry schedule

`TRANSIENT_RETRY_DELAYS_MS = [300, 900, 2700]`.

Three attempts after the initial try, totalling 3.9 seconds. Tuned
for "a network flap lasting a few seconds should be invisible to
the user." Past 4 seconds, recovery via refresh becomes the right
UX (the user notices the staleness).

The delays are exponential-ish but not pure geometric — `300, 900,
2700` matches the natural rhythm of "retry, wait longer, give up."
A pure geometric schedule (`300, 600, 1200, 2400`) would also work
but the four-attempt budget felt like the right tradeoff between
recovery probability and time-to-dead-letter.

## The retry helper

```typescript
export async function withRetry<T>(
  task: () => Promise<T>,
  delays: readonly number[],
  shouldRetry: (err: unknown, attemptsSoFar: number) => boolean = () => true,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      const attempts = i + 1;
      if (i >= delays.length) break;
      if (!shouldRetry(err, attempts)) break;
      await sleep(delays[i]);
    }
  }
  throw lastErr;
}
```

The `sleep` parameter is injectable specifically so unit tests can
pass a no-op and run the whole schedule in microseconds instead of
4 real seconds. The `shouldRetry` callback runs between attempts;
it lets the caller switch to permanent-failure handling mid-sequence
if a subsequent error reveals the real problem was permanent all
along.

The bridge composes them:

```typescript
const attempt = () =>
  (lazyGroup ? ensurePluginByName(lazyGroup) : Promise.resolve())
    .then(() => cmdSvc.executeCommand(rec.id, params, { fromCollab: true }));

void withRetry(attempt, TRANSIENT_RETRY_DELAYS_MS, (err) =>
  classifyReplayError(err) === 'transient'
).catch((err: unknown) => {
  // Final failure — dead-letter it.
  const cls = classifyReplayError(err);
  const record: ReplayFailureRecord = {
    id: rec.id,
    params: rec.p,
    lastError: err instanceof Error ? err.message : String(err),
    attempts: cls === 'transient' ? 1 + TRANSIENT_RETRY_DELAYS_MS.length : 1,
    firstFailedAt: Date.now(),
    lastFailedAt: Date.now(),
    classification: cls,
  };
  noteReplayFailure(record);  // pushes to dead-letter ring buffer
});
```

The dead-letter is a ring buffer (cap 20) of these `ReplayFailureRecord`
objects. The bridge exposes `getReplayDeadLetter()` +
`subscribeReplayDeadLetter()`. The UI now shows them in a
click-to-expand popover on the connection-status pill:

```
┌────────────────────────────────────────────┐
│ Replay failures      Showing latest 3 of 5 │
├────────────────────────────────────────────┤
│ set-range-values [permanent]      12s ago  │
│   Cannot read properties of undefined…     │
├────────────────────────────────────────────┤
│ set-conditional-rule [transient]  45s ago  │
│   Loading chunk 7 failed.                  │
├────────────────────────────────────────────┤
│ set-drawing-apply [permanent]     2m ago   │
│   Error                                    │
├────────────────────────────────────────────┤
│ Refresh usually recovers. Persistent       │
│ failures: copy a sample and file an issue. │
└────────────────────────────────────────────┘
```

Per-record info instead of a vague counter. **Permanent failures
show in red, transients in amber.** The colour signals which
"refresh" actually means: for transient, "the retry budget exhausted
but the underlying network/bundler will recover on next reload;" for
permanent, "you'd need to either remove the offending document
content or upgrade the editor to a version that knows the mutation."

## Why the UI matters

The dead-letter ring buffer makes silent divergences **diagnosable
without code access**. Pre-fix, a real user hitting a real divergence
saw a counter increment and a refresh recommendation; the engineer
got no signal at all unless the user opened DevTools and screenshotted
console warnings.

Now the engineer can ask: "open the connection pill, screenshot
the failure list" — and gets a structured payload that's enough
to know whether the bug is:

- A bundler-deploy issue (transient cluster, all the same chunk
  failing) — likely a CDN cache mismatch
- A plugin-version skew (permanent cluster, all the same command id)
- A data-shape regression (permanent, mixed command ids with similar
  error messages) — usually a recent change to a mutation handler

That triage is impossible from a counter. It takes ~5 seconds from
the dead-letter snapshot.

## What's still hard

A few things this design doesn't solve:

**Dead-letters don't replay.** Once a transient failure burns
through its 4-second budget, the only recovery path is "user
refreshes the page." We deliberately don't auto-retry from the
dead-letter — if it failed three times in four seconds, the issue
is probably more than transient. A future feature could expose a
"retry all" button on the popover, but we haven't needed it.

**The classifier is closed-set.** New transient signatures from
future bundlers (Bun? Rspack? esbuild's HMR-style errors?) won't
be caught until we add their patterns. A regex-based approach would
be more flexible but also more error-prone; the explicit-pattern
approach makes regressions easy to spot in code review.

**Permanent doesn't always mean "give up."** A "mutation references
unknown sheet id" failure today might become recoverable tomorrow
if the missing sheet is created. We currently don't re-evaluate
dead-letter entries when local state changes. A future improvement
could pop entries off the dead-letter when their precondition is
likely to have changed (e.g., a new sheet creation re-tries any
failed mutations targeting that sheet id).

## Code

The classifier + retry helper are in
[`apps/web/src/collab/replay-retry.ts`](https://github.com/schnsrw/sheets/blob/main/apps/web/src/collab/replay-retry.ts)
of [Casual Sheets](/casual-sheets/). 17 unit tests cover every
classifier branch, the retry path, the ring buffer's eviction, and
the pinned retry schedule. The UI surface lives in
[`apps/web/src/shell/CollabIndicator.tsx`](https://github.com/schnsrw/sheets/blob/main/apps/web/src/shell/CollabIndicator.tsx).

The full design lived as Stream A1 + A2 of the
[production-readiness pipeline](https://github.com/schnsrw/sheets/blob/main/docs/PRODUCTION_PIPELINE.md);
both shipped in [v0.2.0](/changelog/sheets-v020/).

---

*[Casual Sheets](/casual-sheets/) is an open-source self-hosted
spreadsheet built on Univer OSS + Yjs + Hocuspocus. Apache-2.0.
`docker run -p 3000:3000 schnsrw/casual-sheets:latest`.*
