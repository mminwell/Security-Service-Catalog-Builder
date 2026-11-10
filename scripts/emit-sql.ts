import { readFileSync, writeFileSync } from "node:fs";
import { sampleArtifactRecords } from "../lib/catalog/artifact-samples";
import { ADDITIONAL_FRAMEWORKS } from "../lib/catalog/framework-catalog";
import { STARTER_FIELDS } from "../lib/catalog/fields";
import { CSF_ELEMENTS, CSF_FRAMEWORK, type FrameworkRelease } from "../lib/catalog/framework";
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
    const active = field.is_active === false ? "false" : "true";
    return `  (null, ${quote(field.field_key)}, ${quote(field.label)}, ${quote(field.help_text)}, ${quote(field.input_type)}, ${lookup}, ${field.is_required ? "true" : "false"}, ${quote(field.visibility)}, ${field.depth_level}, ${field.sort_order}, ${active}, true)`;
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

function artifactSeed(): string {
  const { artifacts, links } = sampleArtifactRecords();
  const artifactValues = artifacts
    .map((artifact) => {
      return `  (${quote(artifact.id)}::uuid, ${quote(artifact.tenant_id)}::uuid, ${quote(artifact.name)}, ${quote(artifact.artifact_type)}, ${sqlText(artifact.owner_team)}, ${sqlText(artifact.status)}, ${sqlText(artifact.version)}, ${sqlText(artifact.review_cadence)}, ${artifact.last_reviewed_date ? `${quote(artifact.last_reviewed_date)}::date` : "null"}, ${sqlText(artifact.link_url)}, ${sqlText(artifact.description)}, ${quote(artifact.visibility)})`;
    })
    .join(",\n");
  const linkValues = links
    .map((link) => {
      return `  (${quote(link.id)}::uuid, ${quote(link.tenant_id)}::uuid, ${quote(link.artifact_id)}::uuid, ${quote(link.service_id)}::uuid, ${sqlText(link.relationship_note)})`;
    })
    .join(",\n");
  return `-- Fictional artifact inventory. Inserts only when the sample workspace and service already exist.
insert into public.artifacts (
  id, tenant_id, name, artifact_type, owner_team, status, version, review_cadence,
  last_reviewed_date, link_url, description, visibility
)
select v.id, v.tenant_id, v.name, v.artifact_type, v.owner_team, v.status, v.version, v.review_cadence,
  v.last_reviewed_date, v.link_url, v.description, v.visibility
from (values
${artifactValues}
) as v(id, tenant_id, name, artifact_type, owner_team, status, version, review_cadence, last_reviewed_date, link_url, description, visibility)
where exists (select 1 from public.tenants t where t.id = v.tenant_id)
on conflict (id) do nothing;

insert into public.artifact_service_links (
  id, tenant_id, artifact_id, service_id, relationship_note
)
select v.id, v.tenant_id, v.artifact_id, v.service_id, v.relationship_note
from (values
${linkValues}
) as v(id, tenant_id, artifact_id, service_id, relationship_note)
where exists (select 1 from public.artifacts a where a.id = v.artifact_id and a.tenant_id = v.tenant_id)
  and exists (select 1 from public.services s where s.id = v.service_id and s.tenant_id = v.tenant_id)
  and not exists (
    select 1 from public.artifact_service_links existing
    where existing.artifact_id = v.artifact_id and existing.service_id = v.service_id
  )
on conflict (id) do nothing;`;
}

function frameworkSeed(conflict: string): string {
  const framework = CSF_FRAMEWORK;
  const header = `insert into public.frameworks (
  id, code, version, name, published_on, publication, publication_url,
  source_title, source_tool, source_url, reference_tool_url, retrieved_on,
  export_change_log, export_generated_at, export_sha256, content_sha256,
  id_namespace, excluded_withdrawn_rows, provenance, is_active
) values (
  ${quote(framework.id)}::uuid,
  ${quote(framework.code)},
  ${quote(framework.version)},
  ${quote(framework.name)},
  ${quote(framework.published_on)}::date,
  ${quote(framework.publication)},
  ${quote(framework.publication_url)},
  ${quote(framework.source_title)},
  ${quote(framework.source_tool)},
  ${quote(framework.source_url)},
  ${quote(framework.reference_tool_url)},
  ${quote(framework.retrieved_on)}::date,
  ${quote(framework.export_change_log)},
  ${quote(framework.export_generated_at)},
  ${quote(framework.export_sha256)},
  ${quote(framework.content_sha256)},
  ${quote(framework.id_namespace)},
  ${framework.excluded_withdrawn_rows},
  ${quote(framework.provenance)},
  true
)
on conflict (code, version) do update set
  name = excluded.name,
  published_on = excluded.published_on,
  publication = excluded.publication,
  publication_url = excluded.publication_url,
  source_title = excluded.source_title,
  source_tool = excluded.source_tool,
  source_url = excluded.source_url,
  reference_tool_url = excluded.reference_tool_url,
  retrieved_on = excluded.retrieved_on,
  export_change_log = excluded.export_change_log,
  export_generated_at = excluded.export_generated_at,
  export_sha256 = excluded.export_sha256,
  content_sha256 = excluded.content_sha256,
  id_namespace = excluded.id_namespace,
  excluded_withdrawn_rows = excluded.excluded_withdrawn_rows,
  provenance = excluded.provenance,
  is_active = excluded.is_active;`;

  const elementInsert = (elementType: "function" | "category" | "subcategory") => {
    const values = CSF_ELEMENTS.filter((element) => element.element_type === elementType)
      .map((element) => {
        const parent = element.parent_id ? `${quote(element.parent_id)}::uuid` : "null";
        return `  (${quote(element.id)}::uuid, ${quote(framework.id)}::uuid, ${quote(element.element_type)}, ${quote(element.code)}, ${parent}, ${quote(element.title)}, ${quote(element.statement)}, ${element.sort_order})`;
      })
      .join(",\n");
    return `insert into public.framework_elements (
  id, framework_id, element_type, code, parent_id, title, statement, sort_order
) values
${values}
${conflict} do update set
  element_type = excluded.element_type,
  parent_id = excluded.parent_id,
  title = excluded.title,
  statement = excluded.statement,
  sort_order = excluded.sort_order;`;
  };

  const coverage = STARTER_LOOKUPS.filter((row) => row.field_key === "outcome_coverage")
    .map((row) => {
      const description = row.description ? quote(row.description) : "null";
      return `  (null, ${quote(row.field_key)}, ${quote(row.code)}, ${quote(row.label)}, ${description}, null, ${row.sort_order}, true)`;
    })
    .join(",\n");
  const coverageSql = `insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
${coverage}
on conflict (field_key, code) where tenant_id is null do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key = 'outcome_coverage'
where not exists (
  select 1
  from public.lookup_options existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
    and existing.code = s.code
);`;

  return [
    "-- NIST CSF 2.0 core. Idempotent. Withdrawn crosswalk rows are not included.",
    header,
    elementInsert("function"),
    elementInsert("category"),
    elementInsert("subcategory"),
    coverageSql,
  ].join("\n\n");
}

function optionalCatalogSql(): string {
  const optional = STARTER_FIELDS.filter((field) => field.field_group);
  const fieldValues = optional
    .map((field) => {
      const lookup = field.lookup_field_key ? quote(field.lookup_field_key) : "null";
      return `  (null, ${quote(field.field_key)}, ${quote(field.label)}, ${quote(field.help_text)}, ${quote(field.input_type)}, ${lookup}, false, ${quote(field.visibility)}, ${field.depth_level}, ${field.sort_order}, false, true)`;
    })
    .join(",\n");
  const keys = optional.map((field) => quote(field.field_key)).join(", ");
  const lookupKeys = [
    ...new Set(optional.map((field) => field.lookup_field_key).filter((key): key is string => Boolean(key))),
  ];
  const lookupValues = STARTER_LOOKUPS.filter((row) => lookupKeys.includes(row.field_key))
    .map((row) => {
      const description = row.description ? quote(row.description) : "null";
      const prefix = row.code_prefix ? quote(row.code_prefix) : "null";
      return `  (null, ${quote(row.field_key)}, ${quote(row.code)}, ${quote(row.label)}, ${description}, ${prefix}, ${row.sort_order}, true)`;
    })
    .join(",\n");
  const lookupKeySql = lookupKeys.map((key) => quote(key)).join(", ");
  const groupUpdates = (["geography", "privacy"] as const)
    .map((group) => {
      const groupKeys = optional.filter((field) => field.field_group === group).map((field) => quote(field.field_key)).join(", ");
      return `update public.field_definitions
set field_group = ${quote(group)}
where field_key in (${groupKeys})
  and field_group is distinct from ${quote(group)};`;
    })
    .join("\n\n");
  return `-- Optional geography and privacy fields. Inactive until an admin enables the group.
-- Re-running does not turn a group back off and does not delete stored values.

insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
) values
${fieldValues}
on conflict (field_key) where tenant_id is null do nothing;

insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
)
select t.id, s.field_key, s.label, s.help_text, s.input_type, s.lookup_field_key,
  s.is_required, s.visibility, s.depth_level, s.sort_order, s.is_active, s.is_standard
from public.tenants t
join public.field_definitions s
  on s.tenant_id is null
 and s.field_key in (${keys})
where not exists (
  select 1 from public.field_definitions existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
);

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
${lookupValues}
on conflict (field_key, code) where tenant_id is null do nothing;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key in (${lookupKeySql})
where not exists (
  select 1 from public.lookup_options existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
    and existing.code = s.code
);

${groupUpdates}`;
}

function frameworkRegistrySql(): string {
  const rows = ADDITIONAL_FRAMEWORKS.map((framework) => frameworkRow(framework)).join(",\n");
  return `-- Selectable frameworks with no control text. NIST CSF 2.0 is not updated here.

insert into public.frameworks (
  id, code, version, name, published_on, publication, publication_url,
  source_title, source_tool, source_url, reference_tool_url, retrieved_on,
  export_change_log, export_generated_at, export_sha256, content_sha256,
  id_namespace, excluded_withdrawn_rows, provenance, is_active, content_state, license_note
) values
${rows}
on conflict (code, version) do update set
  name = excluded.name,
  publication = excluded.publication,
  provenance = excluded.provenance,
  license_note = excluded.license_note,
  content_state = excluded.content_state,
  is_active = excluded.is_active
where public.frameworks.code <> 'NIST-CSF';`;
}

function frameworkRow(framework: FrameworkRelease): string {
  return `  (${quote(framework.id)}::uuid, ${quote(framework.code)}, ${quote(framework.version)}, ${quote(framework.name)}, ${framework.published_on ? `${quote(framework.published_on)}::date` : "null"}, ${quote(framework.publication)}, ${quote(framework.publication_url)}, ${quote(framework.source_title)}, ${quote(framework.source_tool)}, ${quote(framework.source_url)}, ${quote(framework.reference_tool_url)}, null, ${quote(framework.export_change_log)}, ${quote(framework.export_generated_at)}, ${quote(framework.export_sha256)}, ${quote(framework.content_sha256)}, ${quote(framework.id_namespace)}, ${framework.excluded_withdrawn_rows}, ${quote(framework.provenance)}, true, ${quote(framework.content_state)}, ${quote(framework.license_note)})`;
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

const frameworkMigrationPath = "supabase/migrations/0004_v2_csf_mappings.sql";
const frameworkMigration = readFileSync(frameworkMigrationPath, "utf8");
if (!frameworkMigration.includes("-- FRAMEWORK_SEED_BEGIN") || !frameworkMigration.includes("-- FRAMEWORK_SEED_END")) {
  throw new Error("V2 migration is missing FRAMEWORK_SEED markers.");
}
writeFileSync(
  frameworkMigrationPath,
  frameworkMigration.replace(
    /-- FRAMEWORK_SEED_BEGIN[\s\S]*?-- FRAMEWORK_SEED_END/,
    `-- FRAMEWORK_SEED_BEGIN\n${frameworkSeed("on conflict (framework_id, code)")}\n-- FRAMEWORK_SEED_END`,
  ),
);

const v3MigrationPath = "supabase/migrations/0005_v3_exports_frameworks.sql";
const v3Migration = readFileSync(v3MigrationPath, "utf8");
if (!v3Migration.includes("-- OPTIONAL_CATALOG_BEGIN") || !v3Migration.includes("-- FRAMEWORK_REGISTRY_END")) {
  throw new Error("V3 migration is missing catalog markers.");
}
writeFileSync(
  v3MigrationPath,
  v3Migration
    .replace(
      /-- OPTIONAL_CATALOG_BEGIN[\s\S]*?-- OPTIONAL_CATALOG_END/,
      `-- OPTIONAL_CATALOG_BEGIN\n${optionalCatalogSql()}\n-- OPTIONAL_CATALOG_END`,
    )
    .replace(
      /-- FRAMEWORK_REGISTRY_BEGIN[\s\S]*?-- FRAMEWORK_REGISTRY_END/,
      `-- FRAMEWORK_REGISTRY_BEGIN\n${frameworkRegistrySql()}\n-- FRAMEWORK_REGISTRY_END`,
    ),
);

const seed = `-- Optional sample data for Security Service Catalog Builder.
-- Fictional workspaces only: Acme Corp and Meridian Health.
-- Safe to run more than once. Apply the migrations first:
-- supabase/migrations/0001_v1_catalog_core.sql
-- supabase/migrations/0002_v1_1_polish.sql
-- supabase/migrations/0003_v1_2_blueprints_columns_import.sql
-- supabase/migrations/0004_v2_csf_mappings.sql
-- supabase/migrations/0005_v3_exports_frameworks.sql
-- supabase/migrations/0006_v3_field_lookup_toggle.sql
-- supabase/migrations/0007_v3_public_defaults.sql
-- supabase/migrations/0008_v4_artifacts.sql
-- No real client names, credentials, or project URLs.
-- The CSF 2.0 core is loaded by 0004. The block below repeats it so a later seed stays idempotent.
-- Optional field groups are repeated from 0005.
-- NIST CSF 2.0 is the only framework the app shows. 0005 may still insert unused framework rows. This seed does not repeat them.

${fieldInsert("on conflict (field_key) where tenant_id is null do nothing")}

${lookupInsert("on conflict (field_key, code) where tenant_id is null do nothing")}

${frameworkSeed("on conflict (framework_id, code) where tenant_id is null")}

${optionalCatalogSql()}

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

${artifactSeed()}
`;

writeFileSync("supabase/seed.sql", seed);
console.log(`Wrote starter data into ${migrationPath}, ${frameworkMigrationPath}, ${v3MigrationPath}, and supabase/seed.sql`);
