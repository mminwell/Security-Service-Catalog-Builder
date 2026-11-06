-- Security Service Catalog Builder — V1.1 polish.
-- Repeatable. Adds a workspace logo and a soft-archive timestamp.
-- Apply after 0001_v1_catalog_core.sql. This file has no credentials.

alter table public.tenants
  add column if not exists logo_url text;

alter table public.services
  add column if not exists archived_at timestamptz;

create index if not exists services_tenant_archived_idx
  on public.services (tenant_id, archived_at);

comment on column public.tenants.logo_url is
  'Optional company mark: an https image URL or a size-bounded data URL.';

comment on column public.services.archived_at is
  'When set, the service is soft-archived and hidden from the active catalog.';
