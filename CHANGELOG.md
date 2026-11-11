# Changelog

## 5.0.0

Production readiness. The app signs people in with Supabase Auth and no longer stores a catalog in the browser.

- Email and password sign-in, account creation, sign-out, and password reset. The session is refreshed in `proxy.ts` with `@supabase/ssr`. App routes redirect to the sign-in page until a session exists.
- The first account on an empty project becomes Admin of Starter Workspace. Admins invite Viewer, Editor, and Admin members. If that person has no account yet, the invite is stored and applied when they sign up with the same email. Creating another workspace adds the Admin to that workspace only.
- Every mutation the interface makes goes through a server action that checks the caller's role, and row-level security remains on every public table, including artifacts and the new invitation table. Migration `0009_v5_auth_invites.sql`.
- Interactive Demo Mode is gone. A deployment without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` shows a not-configured screen. An Admin can still load the four starter sample services into an empty workspace.
- Sign-in page, empty and error states, 404 and 500 screens, one-row header, and security headers.
- Tests cover role gates, tenant isolation, redirects, URL and logo checks, and the RLS migration contract. Playwright covers the not-configured screen. `scripts/e2e-local-supabase.sh` is the local Auth smoke.
- Empty dollar quotes in the framework seed are real empty strings, and `0010_v5_function_grants.sql` revokes API execute on trigger and helper functions.

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
