-- Security Service Catalog Builder — qualify preview_invitation columns.
-- Apply after 0018_v6_account_audit_workspace.sql. This file has no credentials.
--
-- preview_invitation returns a table whose first column is named email.
-- `select lower(email) from auth.users` was ambiguous with that OUT column
-- (Postgres 42702: column reference "email" is ambiguous), so Finish account
-- could not load an invite. The three reads below match the qualified form
-- already used on the hosted database. CREATE OR REPLACE is idempotent.
-- Existing invitation rows are not updated.
--
-- list_visible_members is language sql and already qualifies every column.
-- list_site_accounts is plpgsql and already qualifies email, role, and its
-- other OUT names. Neither function is replaced here.

create or replace function public.preview_invitation(p_token text)
returns table (
  email text,
  role text,
  workspace_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.workspace_invitations%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  select * into v_row from public.workspace_invitations wi where wi.token = p_token;
  if v_row.id is null or v_row.email <> v_email then
    raise exception 'This invite is for a different email address.';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'This invite was cancelled.';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() and v_row.accepted_at is null then
    raise exception 'This invite has expired.';
  end if;
  select t.name into v_name from public.tenants t where t.id = v_row.tenant_id;
  email := v_row.email;
  role := v_row.role;
  workspace_name := v_name;
  expires_at := v_row.expires_at;
  return next;
end;
$$;

revoke all on function public.preview_invitation(text) from public, anon;
grant execute on function public.preview_invitation(text) to authenticated;
