-- Security Service Catalog Builder — V5 workspace rename.
-- Repeatable. Apply after 0010_v5_function_grants.sql. This file has no credentials.
-- Admins can change tenants.name. The slug stays as it was at creation.
-- The audit row matches the tenant insert written by provision_tenant_internal.

create or replace function public.rename_workspace(p_tenant uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_old text;
  v_slug text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can rename this workspace';
  end if;
  if length(v_name) = 0 then
    raise exception 'Enter a workspace name.';
  end if;
  if length(v_name) > 80 then
    raise exception 'Use a workspace name of at most 80 characters.';
  end if;

  select name, slug into v_old, v_slug
  from public.tenants
  where id = p_tenant;

  if v_slug is null then
    raise exception 'Choose a workspace.';
  end if;
  if v_old = v_name then
    return v_old;
  end if;

  update public.tenants
  set name = v_name, updated_at = now()
  where id = p_tenant;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
  ) values (
    p_tenant,
    auth.uid(),
    coalesce(v_email, 'system'),
    'tenants',
    p_tenant,
    'update',
    jsonb_build_object('name', v_old, 'slug', v_slug),
    jsonb_build_object('name', v_name, 'slug', v_slug)
  );

  return v_name;
end;
$$;

revoke all on function public.rename_workspace(uuid, text) from public, anon;
grant execute on function public.rename_workspace(uuid, text) to authenticated;
