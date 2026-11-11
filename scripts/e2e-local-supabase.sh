#!/usr/bin/env bash
# Run the Playwright smoke against a local Supabase started with the CLI.
# Requires Docker and the Supabase CLI. Does not touch a hosted project.
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Install the Supabase CLI, then run this script again." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Local Supabase needs Docker. Install it, then run this script again." >&2
  exit 1
fi

supabase start
eval "$(supabase status -o env)"
export SSCB_E2E_SUPABASE_URL="${API_URL}"
export SSCB_E2E_SUPABASE_ANON_KEY="${ANON_KEY}"
echo "Local API: ${SSCB_E2E_SUPABASE_URL}"
echo "Apply is handled by supabase start, which runs supabase/migrations in order."
echo "Sign-in e2e still needs a mailbox. Local Inbucket is printed by supabase status."
npx playwright test
