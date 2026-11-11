-- Security Service Catalog Builder — V5 function grants.
-- Repeatable. Apply after 0009_v5_auth_invites.sql. This file has no credentials.
--
-- Postgres grants EXECUTE to PUBLIC on every new function. Supabase also grants
-- it to anon and authenticated. That exposed SECURITY DEFINER functions,
-- including write_audit, on /rest/v1/rpc.
--
-- authenticated keeps EXECUTE on the RPCs the app calls and on the three
-- helpers that RLS policies invoke as the querying role. Trigger functions and
-- helpers that are only called from other SECURITY DEFINER functions are not
-- API endpoints. A trigger still fires without the table writer holding EXECUTE.

alter default privileges in schema public revoke execute on functions from public, anon;

-- Internal helpers and trigger functions.
revoke all on function public.write_audit() from public, anon, authenticated;
revoke all on function public.provision_tenant_internal(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.is_platform_owner() from public, anon, authenticated;
revoke all on function public.apply_service_computeds() from public, anon, authenticated;
revoke all on function public.apply_artifact_computeds() from public, anon, authenticated;
revoke all on function public.assert_artifact_link_tenant() from public, anon, authenticated;
revoke all on function public.export_profile_one_default() from public, anon, authenticated;
revoke all on function public.enforce_outcome_mapping() from public, anon, authenticated;

-- App RPCs. Grep of .rpc( in the app.
revoke all on function public.provision_tenant(text, text) from public, anon;
grant execute on function public.provision_tenant(text, text) to authenticated;

revoke all on function public.ensure_practitioner_access() from public, anon;
grant execute on function public.ensure_practitioner_access() to authenticated;

revoke all on function public.load_starter_sample_services(uuid) from public, anon;
grant execute on function public.load_starter_sample_services(uuid) to authenticated;

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

revoke all on function public.list_visible_members() from public, anon;
grant execute on function public.list_visible_members() to authenticated;

revoke all on function public.import_lookup_options(uuid, text, jsonb) from public, anon;
grant execute on function public.import_lookup_options(uuid, text, jsonb) to authenticated;

revoke all on function public.checkout_blueprint_services(uuid, jsonb) from public, anon;
grant execute on function public.checkout_blueprint_services(uuid, jsonb) to authenticated;

revoke all on function public.import_framework_elements(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_framework_elements(uuid, uuid, jsonb) to authenticated;

revoke all on function public.log_catalog_export(uuid, jsonb) from public, anon;
grant execute on function public.log_catalog_export(uuid, jsonb) to authenticated;

-- RLS policies call these as the current user, so that role needs EXECUTE.
-- is_platform_owner is only reached from other SECURITY DEFINER functions.
revoke all on function public.can_access_tenant(uuid) from public, anon;
grant execute on function public.can_access_tenant(uuid) to authenticated;

revoke all on function public.can_write_services(uuid) from public, anon;
grant execute on function public.can_write_services(uuid) to authenticated;

revoke all on function public.can_admin_tenant(uuid) from public, anon;
grant execute on function public.can_admin_tenant(uuid) to authenticated;
