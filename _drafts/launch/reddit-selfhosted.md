# r/selfhosted

## Title

```
Casual Sheets v0.1.0 — self-hostable .xlsx editor with WOPI, JWT auth, admin panel
```

## Body

```
v0.1.0 of Casual Sheets just landed — the first version-bumped
release. v0.0.x was the "build an Excel-flavored editor end-to-end"
arc; v0.1 earns its self-host story.

**Demo:** https://sheet.schnsrw.live/
**Source:** https://github.com/schnsrw/sheets (Apache-2.0)
**Docs:** https://schnsrw.live/docs/sheets/self-hosting/

**One-liner:**

    docker run -p 3000:3000 schnsrw/casual-sheets:0.1

That gives you the in-memory shape — great for evaluation. For a
real deployment, here's compose with Redis + local FS persistence
+ admin panel:

    services:
      app:
        image: schnsrw/casual-sheets:0.1
        ports: ['3000:3000']
        environment:
          # Room persistence — survives container restarts
          REDIS_URL: redis://redis:6379

          # Workbook storage — choose memory / local / s3 / postgres
          CASUAL_STORAGE: local
          CASUAL_LOCAL_PATH: /data/workbooks

          # Admin panel — env-gated creds; one-shot login mints a
          # session JWT for the panel
          CASUAL_ADMIN_USERNAME: admin
          CASUAL_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
          CASUAL_JWT_SECRET: ${JWT_SECRET}     # 32+ random chars
        volumes:
          - data:/data
        depends_on:
          redis: { condition: service_healthy }
      redis:
        image: redis:7.4-alpine
        command: ['redis-server', '--appendonly', 'yes']
        healthcheck:
          test: ['CMD', 'redis-cli', 'ping']
          interval: 10s
          retries: 5
    volumes:
      data:

**Why this might matter for self-hosting:**

- **WOPI host integration** — four storage backends behind one
  interface: in-memory · local FS · S3-compatible (AWS / MinIO /
  R2 / B2) · Postgres. Selected at runtime via env or admin panel.
  No DB required for the simplest shape.

- **JWT-secured access** — when CASUAL_JWT_SECRET is set, every
  /wopi/files/* request needs a signed token. Claims encode the
  file binding + role + permissions + feature toggles + display
  name + ttl. URL :id must match the token's file_id claim — tokens
  can't lateral-move between files.

- **Admin panel at /admin** — runtime UI for branding · base-path
  mount (reverse-proxy sub-path) · storage backend · networking
  (CORS, trust proxy, HSTS, public origin) · room limits · auth
  providers · webhooks. No restart needed for most edits.

- **Webhooks** with HMAC-SHA256 signing. Nine events
  (room.created, room.dropped, file.uploaded, file.saved,
  file.deleted, user.joined, user.left, admin.login,
  admin.login_failed). Each subscription can have an optional
  signing secret + an event filter. Receivers verify the
  X-Casual-Signature header. Verifier examples for Node, Python,
  Go in the docs.

- **OCI image labels** + rolling-tag scheme. Pin `:0.1.0` for
  exact, `:0.1` for patch-only, `:0` for minor + patch, `:latest`
  for the bleeding edge. Multi-arch amd64 + arm64. SBOM + provenance
  in the manifest so Trivy / Snyk / GitHub dep-graph can verify
  without unpacking.

- **No DB requirement.** State lives in memory while a session is
  active; gone when everyone disconnects. Redis is optional and
  only buys cross-restart room continuity, not document storage.

- **Reverse-proxy ready.** Docs include nginx, Caddy, Traefik
  recipes with the WebSocket upgrade + body-size + sub-path
  mount config you actually need.

Anonymous rooms identified by URL when JWT is off; the v0.0.x
shape still works. Set CASUAL_JWT_SECRET to opt into auth.

Sister project is Casual Editor (real-time .docx with a Go
y-websocket gateway) at https://doc.schnsrw.live.

Happy to answer questions about the docker-compose shape, the
admin panel, or the WOPI / JWT integration.
```

## Notes

- r/selfhosted has a low tolerance for marketing voice — lead with
  the docker-compose, not features.
- Pin the docker-compose in the first comment too — old Reddit
  swallows fenced code in posts sometimes.
- Don't crosspost to r/opensource the same day — 48 h spacing
  prevents Reddit's near-duplicate suppression.
