# Security Service Catalog Builder

**Status: V5.** A multi-tenant catalog for the security services an organization delivers. Sign in with Supabase Auth, enter each service once, shop a blueprint instead of starting from a blank form, map services to NIST CSF 2.0 outcomes, keep the documents and tools those services depend on, and export the audience you choose.

V1 includes the service form, the catalog list, dropdown and field administration, CSV export, workspace isolation, and an audit trail. V2 adds the CSF 2.0 core and workspace assessments. V3 adds saved audience profiles and Excel, Word, and PDF exports. V4 adds the artifact registry. V5 replaces the browser demo with real accounts, roles, and a production shell.

## What you can do

- Sign in, create an account, reset a password, and sign out. The first account on an empty project becomes **Admin** of **Starter Workspace**.
- Invite a **Viewer**, **Editor**, or **Admin**. If they already have an account they are added immediately. If they do not, the invite waits until they sign up with that email.
- Create another workspace from the switcher. You become Admin of that workspace only. A member of workspace A cannot read or write workspace B.
- Capture a service at three depths: **Core**, **Operations**, and **Governance**. Switching depth hides fields. It does not clear them. Only the six Core fields are required.
- See a live service ID suggestion (`SVC-001`, or `SEC-SOC-001` when the workspace uses category prefixes). The code stays editable.
- Read definitions where you pick them: Service Tiers 0–3, CMMI 0–5, capability rating, data classification, NIST CSF 2.0 functions, and every other dropdown that has help text.
- Watch **Maturity Gap** (target CMMI minus current) and **Next Review** update as you type.
- Search the catalog and stack filters on any active field, including a view of archived services. Export the current rows as public or full CSV, Excel, Word, PDF, or JSON, or reuse a workspace audience profile. A file that contains internal fields asks for confirmation first. Distribution marking stays on unless you clear it. Jira and ServiceNow options are local CSV presets, not connections. JSON is built in the browser, pretty-printed, and follows the same field, artifact, and mapping visibility rules.
- Edit dropdown labels, hover descriptions, sort order, and retire options without deleting them.
- Set each field’s public or internal visibility and its Core / Operations / Governance depth per workspace. Retire a field without deleting stored values. Service code and name stay active.
- Archive a service, restore it, or permanently delete it when you are an Admin. Add a company logo in the workspace switcher.
- Open a change history for one service or for the whole workspace.
- Shop pre-built security service blueprints, including company-size and industry packs, review them in a cart, and add them to the catalog in one checkout. On an empty catalog, an Admin can **Load sample catalog** instead. Those four services are fictional starter content, not a demo mode.
- Choose and reorder the columns on the catalog table. Admins can save a workspace default. Everyone else can keep a browser override.
- Import a lookup group from CSV, including a large roster, with a template download and a column-mapping preview.
- Map an active service to NIST CSF 2.0 subcategory outcomes as full, partial, or none, with a rationale and notes. The Full, Partial, None, and Unmapped counts open the outcomes they count. Viewers can read the assessments. Editors and Admins can change them.
- Open CSF Mapping to see the six Functions and drill into categories and outcomes. Counts are explicit assessments on active services. Archived services, blueprint hints, and the primary function dropdown are not coverage.
- Keep a workspace registry of policies, standards, procedures, and tools. The catalog stores a link. It does not host the file. Public exports include only public artifacts and public columns.

Navigation, in order: **Catalog**, **CSF Mapping**, **Artifacts**, **Fields**, **Lookups**, **Templates**. Fields and Lookups are Admin links. The header is a single row.

## Why email and password

Email and password is the sign-in method. It works as soon as the Supabase project exists, including against local Inbucket, and it supports a password reset without asking someone to open a fresh email on every visit. Magic links are a reasonable later option. They are a poor default here because nobody can sign in until SMTP is reliable.

The anon key, or the newer publishable key, is public by design and is the only key the app uses. The service-role key is not read and must not be committed. Isolation is enforced twice: server actions check the caller’s membership before each write, and Postgres row-level security checks it again. Authorization does not use `user_metadata`.

| Role | Scope |
| --- | --- |
| Admin (`tenant_admin`) | One workspace. Services, artifacts, dropdowns, fields, members, and new workspaces they will administer. |
| Editor | One workspace. Create and edit services, artifacts, and assessments. |
| Viewer | One workspace. Read and export. |
| Platform owner | Every workspace. Kept for an operator account that already has this role. New projects do not grant it to the first user. |

## Preview without a database

This repository is not connected to a live Supabase project, and preview deployments are not given one. A preview built without the two public variables shows **This deployment is not configured**. It does not invent a workspace, and it does not keep edits in the browser.

To make a preview or a production deploy actually sign people in, Mike needs:

1. A Supabase project he controls.
2. Migrations `0001` through `0011` applied in order, in the SQL editor or with the Supabase CLI.
3. These Vercel environment variables set for Preview and Production, then a redeploy so Next.js can inline them:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

4. Auth redirect URLs that include `https://<that-deployment>/auth/callback`.

Nothing in this release changes a hosted Supabase project or Vercel production settings. Those steps stay with Mike.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Put the project URL and the anon or publishable key in `.env.local`. Then:

```bash
npm run dev
```

Open the app and create an account. With email confirmation on, use the link in the message. With it off, you land in Starter Workspace.

```bash
npm test
npm run lint
npm run build
```

`npm run test:e2e` checks the not-configured screen. It does not need a database.

A full sign-in smoke against a local Supabase stack:

```bash
npm run e2e:local
```

That script needs Docker and the Supabase CLI. `supabase start` applies `supabase/migrations` in filename order and prints the local API URL, anon key, and Inbucket mailbox. The script exports those and runs Playwright. It does not call a hosted project.

## Deploy runbook

### 1. Create the Supabase project

In the dashboard, create a project and wait until the database is ready. From **Project Settings → API**, copy the project URL and the anon public key or the publishable key. Leave the service-role key and the secret key in the dashboard.

### 2. Run the migrations

In **SQL Editor → New query**, paste and run each file in this order:

1. `supabase/migrations/0001_v1_catalog_core.sql`
2. `supabase/migrations/0002_v1_1_polish.sql`
3. `supabase/migrations/0003_v1_2_blueprints_columns_import.sql`
4. `supabase/migrations/0004_v2_csf_mappings.sql`
5. `supabase/migrations/0005_v3_exports_frameworks.sql`
6. `supabase/migrations/0006_v3_field_lookup_toggle.sql`
7. `supabase/migrations/0007_v3_public_defaults.sql`
8. `supabase/migrations/0008_v4_artifacts.sql`
9. `supabase/migrations/0009_v5_auth_invites.sql`
10. `supabase/migrations/0010_v5_function_grants.sql`
11. `supabase/migrations/0011_v5_rename_workspace.sql`

With the CLI, `supabase link` and `supabase db push` apply the same files. Do that against the project you intend to use. Skip `supabase/seed.sql`. It inserts fictional workspaces that have no members. **Load sample catalog** on an empty workspace is the supported sample.

### 3. Configure Auth

**Authentication → Providers → Email**

- Leave Email enabled.
- Set the minimum password length to 8, matching the app.
- For a private trial, Confirm email can be off. Turn it on before anyone else uses the project.

**Authentication → URL Configuration**

- Site URL: the production origin, such as `https://catalog.example.com`.
- Redirect URLs, one per origin, all ending in `/auth/callback`:
  - `http://localhost:3000/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`
  - `https://<preview-host>/auth/callback` for each Vercel preview you will use
  - `https://<production-host>/auth/callback`

Signup confirmation and password reset both return to `/auth/callback`, which then opens the catalog or the new-password screen. Add a redirect before you send the first real reset email, or Supabase will refuse it.

**Authentication → Emails → SMTP**

Supabase’s built-in mailer is rate limited and is meant for trials. For a real workspace, add your SMTP host, port, username, and password in the dashboard, and set the sender name and address. You can edit the Confirm signup and Reset password templates there. The default templates work with this app’s callback. If you switch a template to `token_hash`, point it at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (use `type=recovery` on the reset template).

Auth rate limits live in **Authentication → Rate Limits**. The app does not add a second limiter. Sign-in, sign-up, and recovery already fail with a “too many attempts” message when Supabase throttles them. A shared edge limiter in front of the deployment is deferred; it needs a store this app does not have.

### 4. Set Vercel environment variables

Import the Git repository. Before the first deploy, set Preview and Production:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`. Next.js inlines `NEXT_PUBLIC_*` at build time, so change the variables and redeploy. A preview that was built without them stays on the not-configured screen.

Framework preset: Next.js. Build command: `npm run build`. Install command: `npm ci` or `npm install`.

### 5. Create the first Admin

Open the deployment, choose **Create account**, and confirm the email if confirmation is on. You land in Starter Workspace with starter dropdowns and an empty catalog. Invite the next person from the workspace switcher.

## Security notes

- Cookies carry the session. Pages are rendered per request. `proxy.ts` refreshes the session and the response is `Cache-Control: private, no-store`, so a shared cache cannot replay `Set-Cookie`.
- Response headers set a content security policy, `nosniff`, `DENY` framing, a strict referrer policy, an empty camera/microphone/geolocation policy, and HSTS. Script source allows inline scripts because the Next.js bootstrap uses them. Nonce-based CSP is deferred.
- Links must be `http` or `https`, with no username or password in the URL. `javascript:` is not rendered. Logo SVG uploads are rejected when they contain a script or an event handler.
- Public exports omit internal fields and internal artifacts, including their names and URLs. A file that still contains an internal field asks for confirmation, and the distribution line is marked in all capitals.
- Server actions return their own error text. Postgres remains the backstop if someone calls the Data API with the anon key directly. Direct table writes still have to satisfy the same role policies.
- Audit rows are insertable only by trigger functions. Authenticated clients can select, not insert.

Deferred, and not done in this release:

- Magic-link sign-in, and invite emails sent by the app. Invites are stored and accepted on signup. Password reset still uses Supabase email.
- Moving security-definer functions out of the exposed `public` schema. The Data API has to call them, and `anon` cannot execute them.
- An application rate limiter in front of Supabase Auth.
- HSTS preload submission.
- A Word user guide. The runbook above is the operator doc.

## Tests

`npm test` covers computed fields, service IDs, filters, exports, CSF mapping, artifacts, role gates, tenant isolation, redirect checks, and a contract that every public table in the migrations enables and forces row-level security.

`npm run test:e2e` opens the not-configured screen in Chromium.

`npm run e2e:local` is the documented local Supabase smoke. CI runs the unit tests, lint, the production build, and the not-configured Playwright check. It does not start Docker.

## Repository layout

- `app/` — screens, the auth callback, and the not-configured, 404, and 500 pages
- `app/actions/catalog.ts` — server mutations and role checks
- `components/` — Birchline interface
- `lib/catalog/` — fields, starter lookups, computed values, service IDs, exports, blueprints, artifacts
- `lib/auth/` — the role matrix, email and password checks, and safe redirects
- `lib/data/` — the in-memory catalog model used by unit tests, and the Supabase adapter
- `supabase/migrations/` — `0001` through `0011`
- `e2e/` — Playwright
- `docs/byo-supabase-vercel.md` — the short deploy note
- `docs/nist-csf-2.0-provenance.md` — source, version, and content hash for the CSF core
- `docs/v4-artifacts.md` — what an artifact stores

The in-memory model still builds fictional Acme Corp and Meridian Health data for unit tests of exports, mapping, and older saved states. The running app does not load it.

## Branch protection

Recommended for `main`, and not applied by this change. A solo-friendly GitHub ruleset:

- Require a pull request before merging. Allow one approval, and allow the author to be that approval if you are the only maintainer, or set required approvals to 0 until a second person joins.
- Require status checks: the CI job (`verify`) must pass.
- Block force pushes and block deletions.
- Do not require a linear history if you merge with merge commits. Require it if you rebase.
- Do not require signed commits, code owners, or deployment reviews until more than one person is merging.
- Leave administrators able to bypass, and use that bypass only to unstick a broken check.

Rulesets are in **Settings → Rules → Rulesets**. Create one targeting `main`.

## Later

A license has not been selected yet. Assisted drafting, if it comes, stays behind a person approving every save.
