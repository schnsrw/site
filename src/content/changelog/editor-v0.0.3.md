---
title: 'v0.0.3 — 100% fidelity + verified co-edit'
product: editor
version: '0.0.3'
date: 2026-05-25
summary: 'Round-trip fidelity hits 44/44 fixtures pristine = 100%. Live co-editing verified end-to-end with a 5-second smoke (multi-peer text fan-out, awareness, live filename rename). New: page color, wordCompat React prop, drawing-fidelity audit, mobile format chip.'
repoUrl: https://github.com/schnsrw/docx/commits/main
---

The fidelity floor cleared the desktop-ship bar (≥ 90%) by a
comfortable margin, and the co-edit path now has a reproducible
end-to-end proof.

## What ships

### Fidelity → 100%

- **44 of 44 fixtures pristine** on the per-tag round-trip audit
  (`scripts/roundtrip-audit.mjs`). Up from 26/39 at the v0.0.2
  preview. The remaining VML cluster closed quietly via raw-XML
  envelope capture.
- **Drawing fidelity audit** — new fixture covers inline image,
  anchored image, standalone `wps:wsp` shape, and `wpg:wgp` group
  with two children. Six asserted geometry specs; two `test.fixme`'d
  for the hybrid layout work still ahead.
- **`drawing-standalone-wps-wsp-dropped`** — fixed-local. Empty
  drawing-only runs were skipped by the run consolidator before the
  textBox enricher could backfill them; the consolidator now
  preserves them.
- **Table fixes** — `table-column-resize`, `table-overlap-text`, and
  `table-merged-cells` all verified-then-pinned closed. Each ships
  with a synthetic fixture + e2e geometry assertions.

### Real-time co-editing, end-to-end verified

- **Smoke test** (`backend/scripts/smoke-coedit.mjs`) — real Yjs
  over real WS, no Playwright. Verifies in five seconds: upload,
  two-client connect, sync handshake, A→B + B→A text fan-out,
  awareness propagation (= peer cursors work), live filename
  rename via the shared `metaMap`, server-side rename round-trip.
- **Live rename** wired end-to-end: `PATCH /api/docs/{id}/rename`
  on the gateway, shared `Y.Map('meta')` on the editor side. A
  peer's rename appears in your title bar instantly; new joiners
  see the new filename in `Content-Disposition`.
- **44 backend tests pass with `-race`** (broadcast, fan-out,
  room manager, upload, download, rename, static SPA path).

### New surface

- **Page color** — doc-level `<w:background>` parses, renders,
  and round-trips. Page Setup dialog gains a Page color picker
  with a None reset (Google Docs pattern).
- **`wordCompat` React prop** — `<DocxEditor wordCompat>` opts
  in to Word's firstRow-only closing-border heuristic (#395) and
  any future Word-specific quirks. Off by default; renderer
  stays faithful to the literal OOXML.
- **Anchored shape position** — tried a 6-layer pipeline change
  that closed the audit specs but caused page-shift regressions
  in real fixtures; reverted with a documented hybrid plan for
  the next attempt.

### Polish

- **Mobile format chip** — floating Bold/Italic/Underline/Strike
  pill on phone viewports. CI flake on Linux Chrome fixed.
- **Status-bar word/char count** rewired to the right derivation
  path.
- **CI green** across all three workflows (CI, Fidelity
  comparison, Pages deploy).

## What's next

- **M2 — Y.Doc → .docx serializer worker** — drain still re-serves
  the original upload; this swap is the next backend milestone.
- **Hybrid anchored-shape layout** — keep the parse + round-trip
  half of the reverted attempt, but reserve cursor space so
  following text doesn't shift up.
- **Floating-image-wrap** — last big visual fidelity gap. XL
  effort, queued.
