# Security Service Catalog Builder

**Status: V1.** A multi-tenant catalog for the security services an organization delivers. Enter each service once, keep internal notes out of public views, and export the audience you choose.

V1 includes the service form, the catalog list, dropdown and field administration, CSV export, workspace isolation, and an audit trail. Framework mapping, audience HTML/Word exports, linked artifacts, and assisted drafting come later.

## What you can do

- Sign in and switch between client workspaces. A platform owner can create a workspace; it is seeded with the starter dropdowns and field definitions.
- Capture a service at three depths: **Core**, **Operations**, and **Governance**. Switching depth hides fields. It does not clear them. Only the six Core fields are required.
- See a live service ID suggestion (`SVC-001`, or `SEC-SOC-001` when the workspace uses category prefixes). The code stays editable.
- Read definitions where you pick them: Service Tiers 0–3, CMMI 0–5, capability rating, data classification, NIST CSF 2.0 functions, and every other dropdown that has help text.
- Watch **Maturity Gap** (target CMMI minus current) and **Next Review** update as you type.
- Search and filter the catalog, toggle **Full internal view** and **Public preview**, and export either the public columns or the full internal set. Both exports respect the current filters.
- Edit dropdown labels, hover descriptions, sort order, and retire options without deleting them.
- Set each field’s public or internal visibility and its Core / Operations / Governance depth per workspace.
- Open a change history for one service or for the whole workspace.

## Architecture

The app is a Next.js App Router project. The same screens run in two modes:

| Mode | When | What it stores |
| --- | --- | --- |
| Interactive Demo Mode | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is empty | Sample workspaces in `localStorage`. A banner says so. |
| Supabase | Both environment variables are set | Postgres, Supabase Auth, and row-level security |

Demo Mode is what `npm run dev` uses out of the box, and what a Vercel preview uses when those variables are not set. It is seeded with Acme Corp and Meridian Health, fictional catalogs you can edit. Reset demo in the top bar restores that seed.

Supabase mode uses `@supabase/ssr` in the browser and in `proxy.ts` (session refresh). The anon key is public by design. The service-role key is not used and must not be committed. Isolation is enforced by row-level security:

| Role | Scope |
| --- | --- |
| `platform_owner` | Every workspace. Can create workspaces and grant the same role. |
| `tenant_admin` | One workspace. Services, dropdowns, fields, and members. |
| `editor` | One workspace. Create and edit services. |
| `viewer` | One workspace. Read and export. |

The first account on an empty project becomes the platform owner and receives a seeded Starter Workspace. Later accounts need a membership. Sample workspaces from `supabase/seed.sql` are visible to a platform owner.

Computed fields use the same rules in the app and in a Postgres trigger: maturity gap is target minus current, and the next review date follows monthly, quarterly, semi-annual, or annual cadence. **On Change** does not calculate a date.

## Local quickstart

```bash
npm install
npm run dev
```

Open the app, enter any email and a password of at least 8 characters, and you are in Acme Corp. Nothing is sent to a server. Create a workspace from the switcher to see an empty catalog and **Load starter sample services**.

```bash
npm test
npm run lint
npm run build
```

## Bring your own Supabase and Vercel

The short version is in [docs/byo-supabase-vercel.md](docs/byo-supabase-vercel.md). In short: create a Supabase project, run `supabase/migrations/0001_v1_catalog_core.sql`, optionally run `supabase/seed.sql`, copy the project URL and anon key into the host environment, and deploy. Do this before the build. Next.js inlines `NEXT_PUBLIC_*` values at build time.

Copy `.env.example` to `.env.local` only on your machine. `.env.local` is gitignored.

## Repository layout

- `app/` — screens: sign-in, catalog, service form, lookup admin, field admin
- `components/` — Birchline interface
- `lib/catalog/` — fields, starter lookups, computed values, service IDs, CSV, sample catalogs
- `lib/data/` — Demo Mode store and the Supabase adapter
- `supabase/migrations/0001_v1_catalog_core.sql` — tables, RLS, audit triggers, provision function, starter data
- `supabase/seed.sql` — the same starter lookups, plus Acme Corp and Meridian Health
- `tests/` — computed fields, service IDs, CSV visibility, lookup retirement, depth behavior

`npm run seed:sql` regenerates the starter rows in the SQL files from `lib/catalog/`. The TypeScript seed is what Demo Mode uses.

Intake methods and target audiences are included so those V1 dropdowns are usable. The locked lookup list did not enumerate them. Everything else in the starter set matches that list, including the tier, CMMI, capability, and data-classification descriptions.

## Later versions

The sequence is unchanged. V2 maps services to NIST CSF 2.0 and shows gaps. V3 adds saved audience exports. V4 links tools, runbooks, and policies. V5 may suggest text, and a person approves every save.

A license has not been selected yet.
