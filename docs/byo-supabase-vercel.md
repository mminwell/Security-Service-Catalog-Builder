# Bring your own Supabase and Vercel

You need a Supabase project and a Vercel account. The app does not use the Supabase service-role key. Do not paste that key into Vercel, `.env.local`, or git.

The full runbook, including redirect URLs and SMTP, is in the README. This page is the short version.

## 1. Create the Supabase project

In the Supabase dashboard, create a project and wait until the database is ready. In **Project Settings → API**, copy:

- Project URL
- The anon public key, or the publishable key

Leave the service-role key and the secret key where they are.

## 2. Apply the schema

Open **SQL Editor → New query**. Paste and run each migration in order:

1. `supabase/migrations/0001_v1_catalog_core.sql`
2. `supabase/migrations/0002_v1_1_polish.sql`
3. `supabase/migrations/0003_v1_2_blueprints_columns_import.sql`
4. `supabase/migrations/0004_v2_csf_mappings.sql`
5. `supabase/migrations/0005_v3_exports_frameworks.sql`
6. `supabase/migrations/0006_v3_field_lookup_toggle.sql`
7. `supabase/migrations/0007_v3_public_defaults.sql`
8. `supabase/migrations/0008_v4_artifacts.sql`
9. `supabase/migrations/0009_v5_auth_invites.sql`

`0008` adds the artifact registry. `0009` adds invitations and makes the first account Admin of Starter Workspace. Do not run `supabase/seed.sql` for a normal project. That file inserts fictional Acme Corp and Meridian Health workspaces with no members, so nobody can open them. Use **Load sample catalog** inside an empty workspace instead.

## 3. Auth

In **Authentication → Providers**, Email is on by default. Set the minimum password length to 8.

For a first trial you can turn off **Confirm email**. Turn it back on before real users arrive, and set **Authentication → URL Configuration**:

- Site URL: the production origin, for example `https://catalog.example.com`
- Redirect URLs: `http://localhost:3000/auth/callback`, `http://127.0.0.1:3000/auth/callback`, each Vercel preview origin plus `/auth/callback`, and the production origin plus `/auth/callback`

Password reset and signup confirmation use that callback. Custom SMTP is under **Authentication → Emails → SMTP**. Until it is set, Supabase sends a limited number of its own messages.

## 4. Deploy on Vercel

Import this Git repository. Before the first deploy, set:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Next.js reads `NEXT_PUBLIC_*` at build time. A preview built without them shows the not-configured screen until you add the variables and redeploy. Do not set the service-role key.

Framework preset: Next.js. Build command: `npm run build`.

## 5. Open the site

Create an account. That first account becomes Admin of **Starter Workspace**, which has the starter dropdowns and an empty catalog. From the workspace switcher an Admin can invite Viewer, Editor, and Admin members, create another workspace, and load the sample catalog while the workspace is empty.

## What the policies do

- An Admin can edit services, artifacts, dropdowns, fields, export profiles, and membership for that workspace, and can create another workspace they will administer.
- An Editor can create and edit services, artifacts, and outcome assessments.
- A Viewer can read and export.
- A platform owner, if one was granted on an older project, can still reach every workspace. New projects do not create that role automatically.
- A member of workspace A cannot read or write workspace B.
- `audit_log` is written by triggers. Clients can read their own workspace history and cannot insert rows into it.
