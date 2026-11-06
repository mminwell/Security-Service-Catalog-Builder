import { readFileSync, writeFileSync } from "node:fs";
import { STARTER_FIELDS } from "../lib/catalog/fields";
import { builtinLogoForSlug } from "../lib/catalog/logos";
import { STARTER_LOOKUPS } from "../lib/catalog/lookups";
import { SAMPLE_TENANTS, STARTER_PACK } from "../lib/catalog/samples";
import { buildService, type ServiceSeed } from "../lib/catalog/service";

const CONTENT_COLUMNS = [
  "service_code",
  "name",
  "internal_name",
  "category",
  "status",
  "service_tier",
  "summary",
  "description",
  "in_scope",
  "out_of_scope",
  "deliverables",
  "prerequisites",
  "owner_team",
  "delivery_team",
  "business_unit",
  "service_owner",
  "delivery_model",
  "target_audience",
  "intake_method",
  "intake_url",
  "approval_required",
  "approver",
  "lead_time",
  "support_contact",
  "hours_of_coverage",
  "sla_response_target",
  "sla_resolution_target",
  "primary_csf_function",
  "capability_rating",
  "threats_addressed",
  "data_classification_handled",
  "kpis_and_metrics",
  "current_maturity_cmmi",
  "target_maturity_cmmi",
  "known_gaps_or_risks",
  "third_party_providers",
  "cost_model",
  "cost_or_effort_notes",
  "current_tooling_notes",
  "internal_notes",
  "review_cadence",
  "last_reviewed_date",
] as const;

function quote(value: string): string {
  const tag = value.includes("$sscb$") ? "$sscb2$" : "$sscb$";
  return `${tag}${value}${tag}`;
}

function sqlText(value: string | null | undefined, required = false): string {
  if (value == null || value.length === 0) return required ? quote("") : "null";
  return quote(value);
}

function contentLiterals(seed: ServiceSeed): string[] {
  const service = buildService("00000000-0000-4000-8000-000000000000", seed);
  return CONTENT_COLUMNS.map((column) => {
    if (column === "approval_required") return service.approval_required ? "true" : "false";
    if (column === "target_audience") {
      if (service.target_audience.length === 0) return "'{}'::text[]";
      return `array[${service.target_audience.map((item) => quote(item)).join(", ")}]::text[]`;
    }
    if (column === "current_maturity_cmmi" || column === "target_maturity_cmmi") {
      const value = service[column];
      return value == null ? "null" : String(value);
    }
    if (column === "last_reviewed_date") {
      return service.last_reviewed_date ? `${quote(service.last_reviewed_date)}::date` : "null";
    }
    if (column === "name" || column === "service_code" || column === "summary") {
      return sqlText(service[column], true);
    }
    const value = service[column];
    return sqlText(typeof value === "string" ? value : null);
  });
}

function fieldInsert(conflict: string): string {
  const values = STARTER_FIELDS.map((field) => {
    const lookup = field.lookup_field_key ? quote(field.lookup_field_key) : "null";
    return `  (null, ${quote(field.field_key)}, ${quote(field.label)}, ${quote(field.help_text)}, ${quote(field.input_type)}, ${lookup}, ${field.is_required ? "true" : "false"}, ${quote(field.visibility)}, ${field.depth_level}, ${field.sort_order}, true, true)`;
  }).join(",\n");
  return `insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
) values
${values}
${conflict};`;
}

function lookupInsert(conflict: string): string {
  const values = STARTER_LOOKUPS.map((row) => {
    const description = row.description ? quote(row.description) : "null";
    const prefix = row.code_prefix ? quote(row.code_prefix) : "null";
    return `  (null, ${quote(row.field_key)}, ${quote(row.code)}, ${quote(row.label)}, ${description}, ${prefix}, ${row.sort_order}, true)`;
  }).join(",\n");
  return `insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
${values}
${conflict};`;
}

function templateServiceInsert(): string {
  const values = STARTER_PACK.map((seed) => `  (${contentLiterals(seed).join(", ")})`).join(",\n");
  return `insert into public.starter_service_templates (
  ${CONTENT_COLUMNS.join(", ")}
) values
${values}
on conflict (service_code) do nothing;`;
}

function sampleBlock(
  tenantId: string,
  slug: string,
  name: string,
  mode: string,
  services: ServiceSeed[],
  logoUrl: string | null,
): string {
  const logoSql = logoUrl ? quote(logoUrl) : "null";
  const rows = services
    .map((seed) => {
      const idSql = seed.id ? `${quote(seed.id)}::uuid` : "gen_random_uuid()";
      return `    (${idSql}, v_tenant, ${contentLiterals(seed).join(", ")}, '{}'::jsonb)`;
    })
    .join(",\n");
  return `do $$
declare
  v_tenant uuid := ${quote(tenantId)}::uuid;
begin
  if exists (select 1 from public.tenants where slug = ${quote(slug)}) then
    update public.tenants
      set logo_url = ${logoSql}
      where slug = ${quote(slug)}
        and logo_url is null;
    return;
  end if;
  perform set_config('sscb.skip_audit', 'on', true);
  insert into public.tenants (id, slug, name, service_code_mode, logo_url)
  values (v_tenant, ${quote(slug)}, ${quote(name)}, ${quote(mode)}, ${logoSql});
  insert into public.field_definitions (
    tenant_id, field_key, label, help_text, input_type, lookup_field_key,
    is_required, visibility, depth_level, sort_order, is_active, is_standard
  )
  select v_tenant, field_key, label, help_text, input_type, lookup_field_key,
    is_required, visibility, depth_level, sort_order, is_active, is_standard
  from public.field_definitions
  where tenant_id is null;
  insert into public.lookup_options (
    tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
  )
  select v_tenant, field_key, code, label, description, code_prefix, sort_order, is_active
  from public.lookup_options
  where tenant_id is null;
  perform set_config('sscb.skip_audit', 'off', true);
  insert into public.services (
    id, tenant_id, ${CONTENT_COLUMNS.join(", ")}, custom_fields
  ) values
${rows};
end $$;`;
}

const starterData = [
  "-- Platform templates. tenant_id is null. provision_tenant copies these into each workspace.",
  fieldInsert("on conflict (field_key) where tenant_id is null do nothing"),
  lookupInsert("on conflict (field_key, code) where tenant_id is null do nothing"),
  templateServiceInsert(),
].join("\n\n");

const migrationPath = "supabase/migrations/0001_v1_catalog_core.sql";
const migration = readFileSync(migrationPath, "utf8");
if (!migration.includes("-- STARTER_DATA_BEGIN") || !migration.includes("-- STARTER_DATA_END")) {
  throw new Error("Migration is missing STARTER_DATA markers.");
}
const nextMigration = migration.replace(
  /-- STARTER_DATA_BEGIN[\s\S]*?-- STARTER_DATA_END/,
  `-- STARTER_DATA_BEGIN\n${starterData}\n-- STARTER_DATA_END`,
);
writeFileSync(migrationPath, nextMigration);

const seed = `-- Optional sample data for Security Service Catalog Builder.
-- Fictional workspaces only: Acme Corp and Meridian Health.
-- Safe to run more than once. Apply the migrations first:
-- supabase/migrations/0001_v1_catalog_core.sql
-- supabase/migrations/0002_v1_1_polish.sql
-- supabase/migrations/0003_v1_2_blueprints_columns_import.sql
-- No real client names, credentials, or project URLs.

${fieldInsert("on conflict (field_key) where tenant_id is null do nothing")}

${lookupInsert("on conflict (field_key, code) where tenant_id is null do nothing")}

${SAMPLE_TENANTS.map((tenant) =>
  sampleBlock(
    tenant.id,
    tenant.slug,
    tenant.name,
    tenant.service_code_mode,
    tenant.services,
    builtinLogoForSlug(tenant.slug),
  ),
).join("\n\n")}
`;

writeFileSync("supabase/seed.sql", seed);
console.log(`Wrote starter data into ${migrationPath} and supabase/seed.sql`);
