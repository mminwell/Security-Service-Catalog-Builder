# Changelog

## Unreleased

- Finish account no longer shows a raw Postgres error when an invite cannot be loaded. A database error becomes "We could not load this invite. Try the link again or ask for a new invite." A different email, a cancelled invite, and an expired invite keep their existing sentences. `0019_v6_preview_invitation.sql` replaces `preview_invitation` so `email` is read from `auth.users` with a table alias. It does not change stored rows.
- Sending an invite says "Invite sent to <email>." Adding someone who already has an account says "<email> was added to the workspace." Resend, cancel, and transfer ownership use the same plain wording and do not show a database field name or an invite token.
- Pull request #19 lets a signed-out person reach password sign-in, magic link, sign-up, and password reset. Those requests are no longer sent back to the login page, which had surfaced the raw message "Auth session missing!" A missing session is treated as signed out, and that raw text is replaced with "Sign-in did not start a session. Try again." There is no new migration.
- In-app help matches what shipped through #18 and #19: sign-in and its plain-language errors, signup without a Company box, workspace transfer and the Site Admin Danger zone, change history, CSF category counts, and the Templates list default.

- Create account no longer asks for a company. The first workspace is named from the first name (`Ada's workspace`) or `My workspace`, and the owner renames it in Workspace Settings (`0018_v6_account_audit_workspace.sql`).
- Role changes, member removal, invitation send, resend, and cancel, plus site-admin deactivate and delete, write an audit row. A platform owner (Site Admin) can delete a workspace or transfer ownership. The deletion audit row is kept after the workspace is gone.
- State-changing auth POSTs, including `POST /auth/callback`, refuse a cross-origin Origin or Referer with HTTP 403.
- CSF Mapping category headings show Full, Partial, None, and Unmapped counts for that category. The blueprint store opens in List when the browser has no saved view.
- Source available under PolyForm Noncommercial 1.0.0. See `LICENSE` and `INSTALL.md`.

- Per-request nonce Content Security Policy. Production scripts are `'self'`, the nonce, and `'strict-dynamic'`, with no `'unsafe-inline'` or `'unsafe-eval'`. Styles keep `'unsafe-inline'` because style attributes cannot take a nonce. HSTS stays without preload.
- Postgres rate limits for password sign-in, magic links, sign-up, password reset, invite sending, and invite acceptance (`0017_v6_rate_limits.sql`). The new table stores hashes. Existing catalog rows are not changed. Apply the file before expecting the limits to run.

- Magic-link sign-in sits beside the password. The request uses the same calm confirmation for every email. A deactivated account is signed out on the callback.
- The top bar has a help panel. Guide pages live in `content/help` and are searched in the browser. Contact support is `mikeminwell2002@protonmail.com`.
- `/demo` is a public fictional catalog. Add, edit, delete, mapping, and export stay in the tab and reset on refresh. The demo does not call Supabase.
- Workspace settings, role-carrying invites, a Service Owner directory, the Service Manager role, and Site Admin account controls.
- Invite send works when pgcrypto is installed in `extensions` (`0015_v6_invite_token.sql`). A failed invite stays on screen until dismissed.
- Saves across the app use one centered confirmation. Workspace Settings is a compact two-column page.
- JSON catalog export. The file is `{slug}-catalog-public.json` or `{slug}-catalog-full.json`, built in the browser with the same audience, field, artifact, and CSF mapping rules as the other formats.
- Show or hide the password on sign-in, create account, and both new-password fields. The eye control is a button, hidden by default.
- Create account collects a first name and last name. Company on the profile is optional. The workspace created for a new account uses a placeholder name from the first name (`0018`), which the owner can rename. Existing accounts are not backfilled. After sign-in, a missing first or last name opens a one-time Complete your profile prompt, and Profile in the account menu can edit the same fields. The header shows the first name, or the email until a first name is saved.
- Primary navigation order is Catalog, Fields, Lookups, Artifacts, CSF Mapping, Templates.

## 5.0.0

Production readiness. The app signs people in with Supabase Auth and no longer stores a catalog in the browser.

- Email and password sign-in, account creation, sign-out, and password reset. The session is refreshed in `proxy.ts` with `@supabase/ssr`. App routes redirect to the sign-in page until a session exists.
- The first account on an empty project becomes Admin of Starter Workspace. Admins invite Viewer, Editor, and Admin members. If that person has no account yet, the invite is stored and applied when they sign up with the same email. Creating another workspace adds the Admin to that workspace only.
- Every mutation the interface makes goes through a server action that checks the caller's role, and row-level security remains on every public table, including artifacts and the new invitation table. Migration `0009_v5_auth_invites.sql`.
- Interactive Demo Mode is gone. A deployment without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` shows a not-configured screen. An Admin can still load the four starter sample services into an empty workspace.
- Sign-in page, empty and error states, 404 and 500 screens, one-row header, and security headers.
- Tests cover role gates, tenant isolation, redirects, URL and logo checks, and the RLS migration contract. Playwright covers the not-configured screen. `scripts/e2e-local-supabase.sh` is the local Auth smoke.
- Empty dollar quotes in the framework seed are real empty strings, and `0010_v5_function_grants.sql` revokes API execute on trigger and helper functions.
- An Admin can rename the active workspace from the header menu. The slug stays put, and the new name is written to the audit log.

## 4.0.0

Supporting artifacts. A workspace registry of policies, standards, procedures, and tools, linked to services and included in full and public exports under the existing visibility rules.

## 3.0.0

Audience exports. Saved profiles, Excel, Word, and PDF, public confirmation, and optional geography and privacy field groups. Additional frameworks stay unloaded until an Admin imports authorized content.

## 2.0.0

NIST CSF 2.0 outcome mapping and the coverage view. Full, partial, and none are explicit assessments. Unmapped is the absence of an assessment.

## 1.2.0

Blueprint catalog, column defaults, and lookup CSV import.

## 1.1.0

Workspace logo and service archive.

## 1.0.0

Service form, catalog, lookups, fields, CSV export, workspace isolation, and the audit trail.
