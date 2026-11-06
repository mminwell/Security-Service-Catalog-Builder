# Bring your own Supabase and Vercel

About five minutes the first time. You need a Supabase project and a Vercel account. The app does not use the Supabase service-role key. Do not paste that key into Vercel, `.env.local`, or git.

## 1. Create the Supabase project

In the Supabase dashboard, create a project and wait until the database is ready. In **Project Settings → API**, copy:

- Project URL
- `anon` public key

Leave the service-role key where it is.

## 2. Apply the schema

Open **SQL Editor → New query**. Paste the full contents of `supabase/migrations/0001_v1_catalog_core.sql` and run it. Then run `supabase/migrations/0002_v1_1_polish.sql` so workspaces can store a logo and services can be archived.

That creates `tenants`, `tenant_members`, `field_definitions`, `lookup_options`, `services`, and `audit_log`, turns on row-level security, and loads the starter dropdowns and field definitions (rows with a null `tenant_id` are the template copied into each new workspace).

Optional: paste `supabase/seed.sql` and run it. That adds two fictional workspaces, **Acme Corp** and **Meridian Health**, with sample services. Skip it if you want to start empty.

## 3. Allow email sign-in

In **Authentication → Providers**, Email is on by default. For a first trial, turn off **Confirm email** under **Authentication → Sign In / Providers → Email** so the first account can enter immediately. Turn confirmation back on when you are ready for real users.

## 4. Deploy on Vercel

Import this Git repository. Before the first deploy, set:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Use your own values. Next.js reads `NEXT_PUBLIC_*` at build time, so a preview that was built without them stays in Interactive Demo Mode until you redeploy with the variables set.

Framework preset: Next.js. Build command: `npm run build`. No other install step.

## 5. Open the site and create the owner

Open the deployment and choose **Create account**. The first account becomes the platform owner and lands in **Starter Workspace**, which already has the starter dropdowns and an empty catalog.

From the workspace switcher you can:

- Create another client workspace. It is seeded with the same dropdowns and fields.
- On an empty workspace, choose **Load starter sample services**.
- Switch service IDs between `SVC-001` and category-prefixed `SEC-SOC-001`.
- Add a member by email after that person has created an account. Until then the app tells you the account does not exist yet.

If you ran `seed.sql`, Acme Corp and Meridian Health appear in the switcher for the platform owner.

## Local Supabase, if you want it

The same SQL files work in the Supabase SQL editor and in the CLI (`supabase db query --file ...`, or your usual migration command). Point `.env.local` at that project’s URL and anon key, then restart `npm run dev`. An empty `.env.local` keeps Interactive Demo Mode.

## What the policies do

- A platform owner can read and write every workspace and can provision new ones.
- A workspace admin can edit services, dropdowns, field visibility, and membership for that workspace only.
- An editor can create and edit services, not dropdowns or fields.
- A viewer can read and export.
- Dropdown deletes are not granted. Retire an option with `is_active = false` so older services still resolve.
- `audit_log` is written by triggers on services, dropdowns, and field definitions. Clients can read their own workspace history and cannot insert rows into it directly.
