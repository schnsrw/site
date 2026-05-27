---
title: 'Casual Editor vs OnlyOffice Document Server — which open-source web .docx editor to self-host'
description: 'Honest technical comparison between Casual Editor (Apache-2.0, Go gateway, ~50 MB Docker image, .docx round-trip 44/44 pristine) and OnlyOffice Document Server (AGPL-3.0, C++ DocService + Node + RabbitMQ, ~1.5 GB image, full office suite). License, architecture, deployment shape, fidelity, integration model, maturity.'
ourProduct: editor
other: 'OnlyOffice Document Server'
verified: 2026-05-28
---

If you've shortlisted "self-hostable open-source web `.docx`
editor," your two real options are
[Casual Editor](/casual-editor/) and OnlyOffice Document Server.
This page is the honest comparison between them.

The single biggest decision factor: **license**. Casual Editor is
Apache-2.0; OnlyOffice's open-source edition is AGPL-3.0. For
most embedded / commercial-product use cases, that's the answer
right there. Past that, the architectures and footprints differ
substantially.

## At a glance

| | **Casual Editor** | **OnlyOffice Document Server** |
|---|---|---|
| License | Apache-2.0 — truly permissive | **AGPL-3.0** + commercial offering |
| File formats | `.docx`, `.odt`, `.md`, `.txt`, PDF export | `.docx`, `.odt`, `.pdf`, plus sheets + slides via sister modules |
| Scope | Documents only (sister projects for sheets + slides) | Full suite — docs + sheets + slides + forms |
| Docker image size | ~50 MB compressed | ~1.5 GB |
| RAM at idle | ~100 MB | ~1.5 GB |
| Backend stack | Go gateway (~120 LOC y-websocket protocol) | C++ DocService + Node UI + RabbitMQ |
| Sync engine | Yjs CRDT + y-websocket | OT (Operational Transform) |
| Maturity | M1 backend live · public preview | 15+ years, mature |
| `.docx` fidelity | **44 of 44 fixtures pristine** (per-tag audit) | Mature, well-tested edge cases |
| Auth | Pluggable host integration (inline / WOPI / JWT-API) | JWT + integration hooks |
| Integration model | Direct UI + WOPI host | WOPI/JWT — designed to embed into Nextcloud / Seafile / etc. |
| Standalone use | First-class | Designed to be embedded; standalone UI is utilitarian |
| Native mobile apps | No (web viewer + light editor at ≤768 px) | Yes (iOS + Android) |
| Multi-format export via WASM worker | Yes (`@schnsrw/core`) | Native via DocService |
| Concurrent users per process | Single Go process — high (Yjs broadcast scales well) | Higher per-process but heavier per-doc |

## License — the elephant in the room

OnlyOffice's open-source edition is **AGPL-3.0**. If you embed it
in a product you ship to anyone — including SaaS users accessing
it over a network — you have to release your full application's
source under AGPL. That's a non-starter for most commercial
products; OnlyOffice sells a commercial license to escape it.

**Casual Editor is Apache-2.0.** Embed it, fork it, wrap it, ship
it to customers — no copyleft, no commercial license to buy. This
is the single biggest reason to pick Casual Editor if you're
building on top.

If you're self-hosting only for your own use (employees, a closed
team) and never plan to redistribute, AGPL doesn't affect you in
practice. In that case the license question is neutral.

(The `docx-editor/` folder in our repo is a fork of
[eigenpal/docx-editor](https://github.com/eigenpal/docx-editor),
which was MIT upstream. We preserved the MIT notice per Apache-2.0
§4 attribution; the fork's own modifications + the Go gateway +
the whole repository are Apache-2.0.)

## Architecture — different design centers

OnlyOffice is built to be **embedded into a host**. It assumes
your authentication system, your file storage, your URL
structure. WOPI is the primary integration surface; the standalone
UI is functional but clearly a secondary concern. The Nextcloud
+ OnlyOffice combination is the canonical deployment.

Casual Editor is built to be **used directly OR embedded**. The
standalone UI is a first-class web app (ribbon, file menu, recent
files, share dialog). The WOPI host integration is there if you
want to plug it into Nextcloud or another DMS, but it's not the
only path.

If your shape is "I want to give my users a great `.docx` editor
right now," Casual Editor makes that one-line easy
(`docker run -p 8080:8080 schnsrw/casual-editor:latest`). If your
shape is "I have a document management system and I want a
`.docx` renderer inside it," OnlyOffice's WOPI-first design fits
better.

## .docx fidelity

| File feature | Casual Editor | OnlyOffice |
|---|---|---|
| Paragraphs + runs + formatting | ✅ | ✅ |
| Tables (borders, shading, merged cells) | ✅ | ✅ |
| Lists (multi-level, custom bullets) | ✅ | ✅ |
| Headers + footers (section-scoped, different first page) | ✅ | ✅ |
| Comments + tracked changes | ✅ | ✅ |
| Math equations | ✅ | ✅ |
| Hyperlinks (text + image) | ✅ | ✅ |
| Footnotes / endnotes | ✅ | ✅ |
| Drop caps | ✅ | ✅ |
| Custom XML / ContentControls | partial | ✅ |
| DrawingML (shapes, images, textboxes) | ✅ | ✅ |
| Complex chart types | re-renders | native |
| All system fonts | ✅ (auto-load `@font-face`) | ✅ |

Casual Editor's per-tag round-trip audit shows
**44 of 44 fixtures pristine** today. The audit covers the OOXML
surface a typical business document uses. OnlyOffice has a decade
of fixes for exotic edge cases (legal contracts with nested
ContentControls, scientific papers with complex equations, very
specific page-layout edge cases). For mainstream documents both
round-trip without surprise. For your most exotic `.docx` files,
OnlyOffice has more tested surface — though the gap is narrower
than the maturity difference suggests.

## Resource footprint

OnlyOffice Document Server ships a kitchen-sink stack:

- **C++ DocService** doing the actual `.docx` parsing + rendering
- **Node UI server** for the web client
- **RabbitMQ** for job queuing
- **Redis** for session state
- **Postgres** for persistence

~1.5 GB Docker image. ~1.5 GB RAM at idle. Multiple processes per
host. Production-tested at scale; correspondingly heavy.

Casual Editor is a Go binary + the built web SPA bundled together:

- Single Go process (the gateway)
- Built web SPA served from the same port
- Stateless — no DB, no on-disk update log; rooms live in memory
  while a session is active

~50 MB Docker image. ~100 MB RAM at idle. Single process.
Per-doc memory is ~370 KB; thousands of active rooms fit
comfortably in a few GB.

If you're sizing for "tiny VPS that just works," the Casual
Editor footprint is roughly **30× smaller**. If you have hardware
to spare and want the integrated suite, OnlyOffice's larger
footprint isn't an issue.

## Integration shape

OnlyOffice's primary integration surface is WOPI. You implement
the WOPI endpoints (CheckFileInfo, GetFile, PutFile) on your
host; OnlyOffice talks to your host. Authentication is JWT-signed
URLs. The host owns file storage.

Casual Editor exposes a similar shape — the pluggable
`host.Integration` interface in Go has three concrete
implementations (`inline`, `wopi`, `jwt-api`). Same separation of
concerns: editor renders, host owns the file. You can pick the
inline impl for the simplest case (file storage in-process,
suitable for the demo) or wire WOPI/JWT for production.

If you're already running Nextcloud / Seafile / ownCloud with the
WOPI client, OnlyOffice is the friction-free choice — both ends
of the WOPI contract are mature. Casual Editor's WOPI side is
M1-level; the inline path is more battle-tested.

## When to choose what

**Pick Casual Editor if:**
- License matters — Apache-2.0 lets you embed, fork, or ship
  without copyleft obligations.
- You only need documents right now (Casual Sheets is the
  sister project for `.xlsx`; Casual Slides for `.pptx`).
- You want a small footprint — a $5/mo VPS comfortably handles a
  small team.
- You're building on top of a document editor and need clean
  extensibility.
- You want a source tree you can read in a weekend (~10k LOC web
  + ~120 LOC Go gateway, vs OnlyOffice's hundreds of thousands).
- You want the .docx round-trip to be measured and tracked (the
  44/44 fixture audit, the per-tag gap matrix).

**Pick OnlyOffice if:**
- You need `.docx` + `.xlsx` + `.pptx` in a single binary today.
- You're embedding into a document-management system (Nextcloud,
  Seafile, ownCloud) that already has WOPI integration.
- You need native mobile apps.
- The AGPL doesn't affect your distribution model (internal use,
  or you have an AGPL-compatible product, or you're buying the
  commercial license).
- You want the most-tested edge-case `.docx` fidelity on the
  exotic features (deep ContentControls, complex chart types,
  legacy form fields).
- You want a production-tested deployment with thousands of
  installations behind you.

Both are real choices. **The AGPL question usually decides for
you.**

## What about the rest of the suite?

[Casual Sheets](https://github.com/schnsrw/sheets) (`.xlsx`,
v0.2.1) and [Casual Slides](https://github.com/schnsrw/slides)
(`.pptx`, v0.0.0 pre-tag) are sister projects in the same suite.
Sheets is production-grade today; Slides is fidelity-mature but
infra-immature. Neither matches OnlyOffice's maturity on those
formats yet.

If you need the **full office suite** today, OnlyOffice covers
all three formats in one binary while Casual Editor only covers
`.docx`. As Casual Sheets and Casual Slides reach v0.2.x parity,
the suite story closes — but today, OnlyOffice's "everything in
one image" is genuinely the right choice if all three formats
matter equally to you.

## Try Casual Editor

```bash
docker run -p 8080:8080 schnsrw/casual-editor:latest
```

Compare image size, RAM use, and startup time directly against an
OnlyOffice Document Server container — the differences are
substantial.

Live demo: <https://doc.schnsrw.live/>. Source:
[github.com/schnsrw/docx](https://github.com/schnsrw/docx).

For the spreadsheet sister, see
[Casual Sheets vs OnlyOffice](/vs/sheets-vs-onlyoffice/).
