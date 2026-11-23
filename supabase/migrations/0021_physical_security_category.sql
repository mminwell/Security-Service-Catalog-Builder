-- Physical Security category.
-- Inserts the shared template row (tenant_id null) and copies it onto every
-- existing workspace. New workspaces already copy template rows when they are
-- created. Safe to run more than once. Does not change the category stored on
-- existing services, and does not insert workspaces, users, invites, or services.

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values (
  null,
  $sscb$category$sscb$,
  $sscb$physical_security$sscb$,
  $sscb$Physical Security$sscb$,
  $sscb$Protection of sites, people, and physical assets: entry and visitor control, badges and keys, video and alarm monitoring, guard operations, physical incidents and investigations, and the design, testing, and maintenance of physical security systems.$sscb$,
  $sscb$PHY$sscb$,
  150,
  true
)
on conflict (field_key, code) where tenant_id is null do nothing;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key = $sscb$category$sscb$
 and s.code = $sscb$physical_security$sscb$
on conflict (tenant_id, field_key, code) where tenant_id is not null do nothing;
