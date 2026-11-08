-- V3 follow-up: let an admin turn a text field into a lookup without rewriting service values.
-- Apply after 0005_v3_exports_frameworks.sql. This file has no credentials.

alter table public.field_definitions
  add column if not exists lookup_bound boolean not null default false;

alter table public.field_definitions
  add column if not exists lookup_restore text;

alter table public.field_definitions
  drop constraint if exists field_definitions_lookup_restore_check;

alter table public.field_definitions
  add constraint field_definitions_lookup_restore_check
  check (lookup_restore is null or lookup_restore = 'dropdown');
