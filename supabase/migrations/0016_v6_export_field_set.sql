-- Security Service Catalog Builder — one workspace export default.
-- Apply after 0015_v6_invite_token.sql. This file has no credentials.
-- Idempotent. It does not delete tenants, profiles, or field lists.
--
-- Existing rows:
-- * tenants gain default_export_field_set, left null. Null means the public catalog.
-- * A tenant whose default_export_profile_id is null and whose profile was marked
--   is_default receives that profile id. A tenant that already has a profile id is unchanged.
-- * export_profiles.is_default is set to false. The flag is no longer a second default.
--   The tenant's profile id and field set are the only default.

alter table public.tenants
  add column if not exists default_export_field_set text;

alter table public.tenants
  drop constraint if exists tenants_default_export_field_set_check;

alter table public.tenants
  add constraint tenants_default_export_field_set_check
  check (default_export_field_set is null or default_export_field_set in ('public', 'full'));

comment on column public.tenants.default_export_field_set is
  'Built-in export field set used when default_export_profile_id is null. Null and public mean the public catalog. full means the full catalog.';

update public.tenants t
set default_export_profile_id = p.id
from public.export_profiles p
where t.default_export_profile_id is null
  and p.tenant_id = t.id
  and p.is_default;

update public.export_profiles
set is_default = false
where is_default;

drop function if exists public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean);
drop function if exists public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean, text);

create function public.save_workspace_settings(
  p_tenant uuid,
  p_distribution_public text,
  p_distribution_internal text,
  p_format text,
  p_profile uuid,
  p_reminder boolean,
  p_mark_reminder_seen boolean,
  p_field_set text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public text := nullif(btrim(coalesce(p_distribution_public, '')), '');
  v_internal text := nullif(btrim(coalesce(p_distribution_internal, '')), '');
  v_format text := nullif(btrim(coalesce(p_format, '')), '');
  v_field_set text := nullif(btrim(coalesce(p_field_set, '')), '');
  v_email text;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can change workspace settings';
  end if;
  if v_public is not null and char_length(v_public) > 240 then
    raise exception 'Use a shorter public distribution statement';
  end if;
  if v_internal is not null and char_length(v_internal) > 240 then
    raise exception 'Use a shorter internal distribution statement';
  end if;
  if v_format is not null and v_format not in ('csv', 'xlsx', 'docx', 'pdf', 'json') then
    raise exception 'Unknown export format';
  end if;
  if v_field_set is not null and v_field_set not in ('public', 'full') then
    raise exception 'Unknown export field set';
  end if;
  if p_profile is not null and not exists (
    select 1 from public.export_profiles where id = p_profile and tenant_id = p_tenant
  ) then
    raise exception 'That export profile is not in this workspace';
  end if;
  if p_profile is not null then
    v_field_set := null;
  elsif v_field_set is null then
    v_field_set := 'public';
  end if;

  select jsonb_build_object(
    'distribution_public', distribution_public,
    'distribution_internal', distribution_internal,
    'default_export_format', default_export_format,
    'default_export_profile_id', default_export_profile_id,
    'default_export_field_set', default_export_field_set,
    'owner_reminder_enabled', owner_reminder_enabled
  )
  into v_before
  from public.tenants
  where id = p_tenant;

  update public.tenants
  set
    distribution_public = v_public,
    distribution_internal = v_internal,
    default_export_format = v_format,
    default_export_profile_id = p_profile,
    default_export_field_set = v_field_set,
    owner_reminder_enabled = coalesce(p_reminder, false),
    owner_reminder_seen_at = case
      when p_mark_reminder_seen then now()
      else owner_reminder_seen_at
    end,
    updated_at = now()
  where id = p_tenant;

  update public.export_profiles
  set is_default = false
  where tenant_id = p_tenant
    and is_default;

  select jsonb_build_object(
    'distribution_public', distribution_public,
    'distribution_internal', distribution_internal,
    'default_export_format', default_export_format,
    'default_export_profile_id', default_export_profile_id,
    'default_export_field_set', default_export_field_set,
    'owner_reminder_enabled', owner_reminder_enabled
  )
  into v_after
  from public.tenants
  where id = p_tenant;

  if v_before is distinct from v_after then
    select email into v_email from auth.users where id = auth.uid();
    insert into public.audit_log (
      tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
    ) values (
      p_tenant, auth.uid(), coalesce(v_email, 'system'), 'tenants', p_tenant, 'update', v_before, v_after
    );
  end if;
end;
$$;

revoke all on function public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean, text) from public, anon;
grant execute on function public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean, text) to authenticated;
