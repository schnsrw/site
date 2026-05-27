---
title: 'Casual Sheets vs Airtable — when you want a spreadsheet, not a database'
description: 'Honest comparison between Casual Sheets (Excel-shaped open-source web spreadsheet, .xlsx round-trip, Apache-2.0) and Airtable (database-with-spreadsheet-UI, proprietary SaaS, $10-45/user/mo). Different product categories despite the surface similarity — pick based on whether you want formulas + files or relational data + views.'
ourProduct: sheets
other: 'Airtable'
verified: 2026-05-28
---

This is an honest comparison and the honest answer is:
**Casual Sheets and Airtable solve different problems.** They look
similar from a screenshot — both show rows of cells in a grid.
But Airtable is a database with a spreadsheet-flavoured UI, while
Casual Sheets is a true spreadsheet with formulas and `.xlsx`
files as the unit of work.

If you searched **"open source Airtable alternative"** you might
actually want one of: NocoDB, Baserow, Grist, Teable. Those are
all database-shaped (proper schemas, relational links, multiple
view types). Casual Sheets is a different tool. **Read on if you
think you might actually want a spreadsheet** — files, formulas,
charts, pivot tables, `.xlsm` macros.

## At a glance

| | **Casual Sheets** | **Airtable** |
|---|---|---|
| Product shape | Spreadsheet (file-centric) | Database (record-centric) |
| Unit of work | `.xlsx` file you can email | Base + tables in proprietary store |
| Cells contain | Values + formulas | Typed fields (text, number, link, attachment, formula, etc.) |
| Formula model | Excel-compatible (~500 functions) | Airtable's formula language (subset of Excel + Airtable-specific) |
| Pivot tables | Yes, with drill-down | Yes (paid plan only) |
| Charts | 8 types + sparklines | Yes (paid plan only) |
| Real-time co-edit | Yes (Yjs + Hocuspocus) | Yes |
| File format | `.xlsx` / `.ods` / `.csv` round-trip | Proprietary; export to CSV (no formulas) |
| `.xlsm` macros | Round-trip byte-equal | Not supported |
| Relational links | No (use VLOOKUP / INDEX-MATCH) | Yes, first-class |
| Multiple views | One grid per sheet | Grid / Kanban / Calendar / Gallery / Form / Gantt per table |
| Forms | No | Yes (built-in) |
| API | No (yet) — the editor is the API | REST API for every base |
| License | Apache-2.0 — open source | Proprietary SaaS |
| Hosting | Self-host via Docker | Airtable-hosted only |
| Price | Free; pay your own hosting (~$5–50/mo) | Free up to limits; Team $10–20/user/mo, Business $45/user/mo, Enterprise custom |
| Mobile | Web viewer + light editor | Native iOS + Android apps |
| Maturity | v0.2.1 · 6 months | 13 years, mature |

## Where Casual Sheets is the right tool

- **You have `.xlsx` files and you want to edit them.** That's the
  whole product. Upload, edit, save back. The file is the source
  of truth.
- **You need Excel-shape formulas.** SUMIFS, INDEX-MATCH, array
  formulas, VLOOKUP, etc. — same syntax as desktop Excel because
  the formula engine is Univer OSS, which targets Excel
  compatibility.
- **You need `.xlsm` macro preservation.** The byte-equal
  round-trip on VBA is unique among web spreadsheets — we don't
  execute VBA in the browser (no web spreadsheet does) but we
  preserve `xl/vbaProject.bin` on save so the next desktop user
  has working macros.
- **You want pivot tables in the free tier.** Casual Sheets ships
  pivot tables with drill-down (Ctrl+Shift+D) at zero cost.
  Airtable gates pivot views behind paid plans.
- **You want it on your servers.** Self-host via Docker; no
  Airtable account, no proprietary data store, no per-user SaaS
  billing.
- **You're building on top of a spreadsheet.** Apache-2.0 means
  embed it without negotiating commercial licensing.

## Where Airtable is the right tool

- **Your data is relational.** "Each task has an Owner from the
  People table; each Owner can have many Tasks; show me all
  Tasks where Owner.Department = Engineering." This is database
  thinking, not spreadsheet thinking. Airtable's `Link to another
  record` field is first-class; in a spreadsheet you'd hack it
  with VLOOKUP and lose referential integrity.
- **You need multiple views of the same data.** A list of tasks
  rendered as a Kanban board (sorted by status), a Calendar (sorted
  by due date), AND a grid — all backed by the same records.
  Spreadsheets have one grid per sheet.
- **You need forms feeding into the data.** Airtable's form-builder
  collects records from public URLs into your base, complete with
  validation. Casual Sheets has no equivalent.
- **You want an API.** Airtable exposes a REST API for every base
  — read, write, list. Useful when integrating with other tools.
  Casual Sheets doesn't have a programmable API today.
- **You need attachments.** Airtable's "Attachment" field holds
  files alongside records. Casual Sheets is a spreadsheet — cells
  hold values, not files.
- **You want the marketplace.** Airtable has thousands of
  extensions, sync integrations, and automation recipes. Casual
  Sheets has none.
- **You're building a lightweight internal tool, not a workbook.**
  CRM-like, ATS-like, project-tracker-like — Airtable's
  relational + multi-view shape is much better than a spreadsheet
  for these.

## The shape mismatch in one example

Imagine you're tracking customer support tickets.

**Airtable shape:**
- One "Tickets" table with fields: ID, Subject, Status, Priority,
  Customer (link → Customers table), Assignee (link → People
  table), Created, Updated, Notes (long text), Attachments.
- One "Customers" table with fields: ID, Name, Plan, Account
  Manager (link → People).
- One "People" table.
- Views on Tickets: Grid (all tickets), Kanban (by Status),
  Calendar (by Created), filtered "My Tickets" view per assignee.
- A public form for customers to submit new tickets directly
  into the table.
- An automation: when Status → "Resolved," send the customer a
  follow-up email.

**Casual Sheets shape:**
- One workbook with three sheets: Tickets, Customers, People.
- VLOOKUP / INDEX-MATCH from Tickets to Customers + People for
  the "current assignee" + "customer plan" columns.
- No views — just sheets. Filtering uses AutoFilter (Ctrl+Shift+L).
- No form — customers email tickets, someone pastes them in.
- No automation — someone watches the Status column and emails the
  customer manually.

For the support-ticket use case, **Airtable is the right tool**.
The relational shape + views + form + automation make it work.

For a financial model, an inventory workbook, a sales-forecast
spreadsheet, or anything that's fundamentally formula-driven and
file-shaped, **Casual Sheets is the right tool**. Airtable's
formula language is a subset; its grid is record-rendered, not
cell-addressable; its export-to-spreadsheet loses formulas.

## Open-source alternatives to Airtable (not us)

If you came here looking for an open-source Airtable alternative,
the products you actually want are:

- **[NocoDB](https://nocodb.com/)** — most popular Airtable-shaped
  OSS, AGPL-3.0
- **[Baserow](https://baserow.io/)** — also Airtable-shaped, MIT
  for the community edition
- **[Grist](https://www.getgrist.com/)** — closer to a spreadsheet
  but with database-ish features
- **[Teable](https://teable.io/)** — newer, Postgres-backed

I'm not affiliated with any of those; this paragraph exists
because if you're reading this comparison expecting an Airtable
clone, **the honest answer is "pick a different tool, not Casual
Sheets."**

## Cost — when each makes sense

For a 20-person team:

| Product | Cost | Use when |
|---|---|---|
| Casual Sheets self-host | ~$15/mo VPS | You need real spreadsheets + .xlsx files |
| Airtable Free | $0 (up to 1000 records/base) | Tiny relational data, you can live with the limits |
| Airtable Team | $200/mo (20 × $10) | Real relational data, modest API use |
| Airtable Business | $900/mo (20 × $45) | Relational data + advanced views + admin |
| NocoDB self-host | ~$10/mo VPS | Open-source Airtable shape |
| Baserow self-host | ~$10/mo VPS | Open-source Airtable shape |

The cost question is mostly moot until you've answered the
**shape** question first. Pick the shape, then pick the product.

## When to choose what

**Pick Casual Sheets if:**
- Your data lives in `.xlsx` files and you want to edit them
  on the web.
- Excel-shape formulas matter (you're already familiar with the
  formula syntax).
- You need `.xlsm` macro preservation.
- You want self-host + Apache-2.0.

**Pick Airtable if:**
- Your data is relational (linked records).
- You need multiple views of the same data (Kanban, Calendar,
  Gallery, Form).
- You need a public form feeding into the data.
- You depend on Airtable's API + integration marketplace.

**Pick an Airtable open-source clone (NocoDB, Baserow, Grist,
Teable) if:**
- All of the Airtable reasons above PLUS you want self-host or
  open source.

## Try Casual Sheets

```bash
docker run -p 3000:3000 schnsrw/casual-sheets:latest
```

Live demo: <https://sheet.schnsrw.live/>.

If you discover halfway through that you actually want a
database-shape tool, that's useful information — better to find
out from a 5-minute demo than after committing your workflow.
