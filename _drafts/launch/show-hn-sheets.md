# Show HN — Casual Sheets v0.1.0

## Title (≤ 80 chars)

```
Show HN: Casual Sheets v0.1.0 – self-hostable .xlsx editor with WOPI + JWT
```

## URL field

```
https://sheet.schnsrw.live/
```

## First comment (post immediately after submission)

```
Hi HN — Casual Sheets is an open-source, self-hostable web
spreadsheet. v0.1.0 just landed today; it's the first release that
earns its self-host story.

Demo: https://sheet.schnsrw.live/
Repo: https://github.com/schnsrw/sheets   (Apache-2.0)
Docker: docker run -p 3000:3000 schnsrw/casual-sheets:0.1
Docs: https://schnsrw.live/docs/sheets/self-hosting/

What I wanted that didn't quite exist: an Excel-flavored editor
where the .xlsx file is the source of truth (not an export target),
that you can self-host in one container, with a real admin panel
for branding + storage + auth + webhooks. Not a Google Sheets
clone — a single-binary office tool you can run inside your VPN.

v0.1.0 ships:

  - WOPI host integration — four backends behind one interface:
    memory (default) · local FS · S3-compatible (AWS / MinIO / R2 /
    B2) · Postgres. Selected by CASUAL_STORAGE env var.

  - JWT-secured access. Tokens encode file_id + role + permissions +
    feature toggles + display_name + ttl. The URL :id must match the
    token's file_id claim, so a token issued for file A can never be
    used to access file B. Admin-role tokens mint subordinate tokens
    via POST /api/tokens.

  - Admin panel at /admin — branding (app name + accent + logo),
    base-path mount for reverse proxies, storage backend selection
    with creds + test-connection, networking (CORS allowlist, trust
    proxy, HSTS), room limits, auth provider configs (JWT live;
    OIDC + SAML schema present for v0.2), webhook subscriptions.
    Env-gated; secrets redacted on read.

  - Webhook dispatcher with HMAC-SHA256 signing. 9 events: room
    create/drop, file upload/save/delete, user join/leave, admin
    login. Receivers verify the X-Casual-Signature header. Three
    verifier examples (Node / Python / Go) in the docs.

  - .xlsx round-trip audit at 54/54 pristine. Macros (vbaProject.bin)
    AND pivot caches (pivotCaches/** + pivotTables/**) ride through
    byte-equal — Excel re-opens the file as a macro-enabled / pivot-
    enabled workbook after our pipeline touches it.

  - OCI image labels + rolling-tag scheme: schnsrw/casual-sheets:0.1
    rolls forward on patches; :0.1.0 is the pin. Multi-arch (amd64 +
    arm64). SBOM + provenance attestations in the manifest.

The architecture is small enough to read end-to-end. Univer OSS
(Apache-2.0) is the grid + formula engine; everything above — the
Office shell, the WOPI layer, the JWT auth, the admin panel, the
webhook dispatcher, the OOXML passthrough — is in this repo. Total
LOC including tests is around 50k lines of TypeScript.

Sister project is Casual Editor (real-time .docx, ProseMirror + Go
y-websocket gateway) at https://doc.schnsrw.live; both live under
the Casual Office umbrella at https://schnsrw.live.

Happy to answer questions about the WOPI shape, the JWT claim
model, the OOXML pivot/macro passthrough, or how the admin panel
composes with env vars (env = bootstrap floor; panel = runtime
override).
```

## Notes for posting

- **Timing**: Tuesday or Wednesday morning Pacific (around 9 am PT).
  Avoid Mondays + weekends.
- **Watch the thread** for 2–3 hours. Reply to every comment in the
  first hour with substance — primary ranking signal.
- **Don't ask for upvotes anywhere**. Don't edit the title later to
  pile on features. If updates are big, do a fresh "Show HN: v0.2"
  in a few months.
- **Have the live demo ready** for traffic spikes. The Pages
  deploy can absorb the hug, but the Docker self-hosters will be
  the converters. Show HN drives the demo; the demo drives the
  repo stars; stars drive LLM training inclusion.
- **First reply** auto-floats to the top — make it count.
