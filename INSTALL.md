# Install

Self-hosting guide for the Security Service Catalog Builder. The license is [PolyForm Noncommercial 1.0.0](LICENSE). Personal, educational, research, and nonprofit use is free. Commercial use, including use by or for a business or in paid consulting, needs a separate license from the author: https://minwell.app.

These steps do not change an existing hosted project until the SQL or the deploy settings are applied on purpose.

## What you need

- Node.js 20.9 or newer
- npm
- A Supabase project you control
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker, for a database that runs on this machine

The app uses the anon key, or the newer publishable key. That key is public by design. Do not put the service-role key in the repository, in `.env.local`, or in a `NEXT_PUBLIC_` variable.

## 1. Get the code

```bash
git clone https://github.com/mminwell/Security-Service-Catalog-Builder.git
cd Security-Service-Catalog-Builder
npm install
cp .env.example .env.local
```

## 2. Create the Supabase project

In the Supabase dashboard, create a project and wait until the database is ready. From **Project Settings → API**, copy the project URL and the anon public key or the publishable key. Leave the service-role key and the secret key in the dashboard.

## 3. Run the migrations

Apply every file in `supabase/migrations` in filename order. None of them drop tables or columns that already hold data.

In **SQL Editor → New query**, paste and run each file:

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
12. `supabase/migrations/0012_v6_user_profiles.sql`
13. `supabase/migrations/0013_v6_phase2_members.sql`
14. `supabase/migrations/0014_v6_phase2_owners.sql`
15. `supabase/migrations/0015_v6_invite_token.sql`
16. `supabase/migrations/0016_v6_export_field_set.sql`
17. `supabase/migrations/0017_v6_rate_limits.sql`
18. `supabase/migrations/0018_v6_account_audit_workspace.sql`

With the CLI, from this directory:

```bash
supabase link
supabase db push
```

`supabase link` asks which project to use. `supabase db push` applies the same files in filename order. Point it at the project you intend to use.

Skip `supabase/seed.sql`. It inserts fictional workspaces that have no members, so nobody can open them. **Load sample catalog** on an empty workspace is the supported sample.

`0012` stores a profile name and does not rename a workspace that already exists. `0015` only replaces invite functions so a token can be created when pgcrypto lives in the `extensions` schema. `0017` adds the app's rate limiter. `0018` names a new account's first workspace from the first name, writes the missing audit rows, and lets a platform owner (Site Admin) transfer or delete a workspace. Apply `0018` before relying on those behaviors. Pull request #19 does not add a migration. It lets a signed-out person reach sign-in, magic link, sign-up, and password reset instead of being sent back to the login page.

## 4. Configure Auth

**Authentication → Providers → Email**

- Leave Email enabled.
- Set the minimum password length to 8, matching the app.
- For a private trial, Confirm email can be off. Turn it on before anyone else uses the project.

**Authentication → URL Configuration**

- Site URL: the origin people will use, such as `http://localhost:3000` or `https://catalog.example.com`.
- Redirect URLs, one per origin, all ending in `/auth/callback`:
  - `http://localhost:3000/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`
  - `https://<preview-host>/auth/callback` for each preview that should sign in
  - `https://<production-host>/auth/callback`

Signup confirmation, magic-link sign-in, and password reset all return to `/auth/callback`. Add a redirect before the first real email, or Supabase will refuse it.

**Authentication → Emails → SMTP**

Supabase's built-in mailer is rate limited and is meant for trials. For a real workspace, add the SMTP host, port, username, and password in the dashboard, and set the sender name and address. The Confirm signup and Reset password templates can be edited there. The default templates work with this app's callback. If a template is switched to `token_hash`, point it at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (use `type=recovery` on the reset template).

Auth rate limits in the Supabase dashboard still apply. After `0017`, the app also limits sign-in, magic-link, sign-up, and password-reset emails to 5 per address and 20 per IP per 15 minutes, and limits invites to 20 per admin per hour. A full bucket answers with HTTP 429.

## 5. Configure the app

Put the project URL and the anon or publishable key in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`. The app does not need it for sign-in, and it must not be committed.

Then:

```bash
npm run dev
```

Open `http://localhost:3000`. Choose **Create account**. The form asks for a first name, last name, email, and password. There is no Company box. The first account on an empty project becomes Admin of one workspace. The workspace name is a placeholder: the first name plus `'s workspace` (for example, "Ada's workspace"), or "My workspace" when that would be empty or too long. Rename it later in **Workspace Settings**. The slug does not change when the name changes.

With email confirmation on, use the link in the message. With it off, the account opens the catalog immediately.

Invite the next person from Workspace Settings. A later account joins only through an invitation.

## 6. Optional: deploy on Vercel

Import the Git repository. Before the first deploy, set Preview and Production:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`. Next.js inlines `NEXT_PUBLIC_*` at build time, so change the variables and redeploy. A preview built without them shows **This deployment is not configured**. **Try the demo** at `/demo` still opens, and those edits stay in the browser tab.

Framework preset: Next.js. Build command: `npm run build`. Install command: `npm ci` or `npm install`.

Add that deployment's origin to the Supabase redirect URLs, ending in `/auth/callback`, before sending a confirmation or reset email.

## Updating

Pull the latest code, run `npm install`, and apply any new files in `supabase/migrations` that are not on the database yet. Keep filename order. `supabase db push` does that against the linked project. Then restart `npm run dev`, or redeploy. Existing workspaces keep their current names. `0018` does not rename them. Pull request #19 has no new migration. Redeploy it so signed-out sign-in is not sent back to the login page.
