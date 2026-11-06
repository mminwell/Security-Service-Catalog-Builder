import { canAdminister, canWriteServices } from "@/lib/catalog/access";
import { isIdentityField, materializeFields } from "@/lib/catalog/fields";
import { builtinLogoForSlug, normalizeLogoInput } from "@/lib/catalog/logos";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { SAMPLE_TENANTS, STARTER_PACK } from "@/lib/catalog/samples";
import { buildService, normalizeService, withComputed } from "@/lib/catalog/service";
import { uniqueSlug } from "@/lib/catalog/service-code";
import {
  DEMO_USER_ID,
  type AuditEntry,
  type FieldDefinition,
  type LookupOption,
  type Member,
  type Role,
  type ServiceCodeMode,
  type ServiceRecord,
  type SessionUser,
  type Tenant,
} from "@/lib/catalog/types";

export type CatalogDb = {
  session: SessionUser | null;
  activeTenantId: string | null;
  tenants: Tenant[];
  members: Member[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  services: ServiceRecord[];
  audit: AuditEntry[];
};

const SEEDED_AT = "2026-11-01T15:00:00.000Z";

export function emptyDb(): CatalogDb {
  return {
    session: null,
    activeTenantId: null,
    tenants: [],
    members: [],
    fields: [],
    lookups: [],
    services: [],
    audit: [],
  };
}

export function freshDemo(): CatalogDb {
  const tenants: Tenant[] = [];
  const members: Member[] = [];
  const fields: FieldDefinition[] = [];
  const lookups: LookupOption[] = [];
  const services: ServiceRecord[] = [];

  for (const sample of SAMPLE_TENANTS) {
    tenants.push({
      id: sample.id,
      slug: sample.slug,
      name: sample.name,
      service_code_mode: sample.service_code_mode,
      logo_url: builtinLogoForSlug(sample.slug),
      catalog_columns: null,
      is_active: true,
      created_at: SEEDED_AT,
      updated_at: SEEDED_AT,
    });
    members.push({
      id: `member:${sample.id}:${DEMO_USER_ID}`,
      tenant_id: sample.id,
      user_id: DEMO_USER_ID,
      email: "demo.practitioner@example.com",
      role: "platform_owner",
      created_at: SEEDED_AT,
    });
    fields.push(...copyFields(sample.id));
    lookups.push(...copyLookups(sample.id));
    services.push(
      ...sample.services.map((seed) => buildService(sample.id, seed, SEEDED_AT)),
    );
  }

  return {
    session: null,
    activeTenantId: tenants[0]?.id ?? null,
    tenants,
    members,
    fields,
    lookups,
    services,
    audit: [],
  };
}

export function signInDemo(db: CatalogDb, email: string): CatalogDb {
  const normalized = email.trim().toLowerCase();
  return {
    ...db,
    session: { userId: DEMO_USER_ID, email: normalized },
    members: db.members.map((member) =>
      member.user_id === DEMO_USER_ID ? { ...member, email: normalized } : member,
    ),
    activeTenantId: db.activeTenantId ?? db.tenants[0]?.id ?? null,
  };
}

export function signOutDemo(db: CatalogDb): CatalogDb {
  return { ...db, session: null };
}

export function switchTenant(db: CatalogDb, tenantId: string): CatalogDb {
  if (!db.tenants.some((tenant) => tenant.id === tenantId)) return db;
  return { ...db, activeTenantId: tenantId };
}

export function createTenant(db: CatalogDb, name: string, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Enter a workspace name.");
  const slug = uniqueSlug(
    trimmed,
    db.tenants.map((tenant) => tenant.slug),
  );
  const id = crypto.randomUUID();
  const tenant: Tenant = {
    id,
    slug,
    name: trimmed,
    service_code_mode: "sequential",
    logo_url: null,
    catalog_columns: null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  const member: Member = {
    id: crypto.randomUUID(),
    tenant_id: id,
    user_id: actor.userId,
    email: actor.email,
    role: "platform_owner",
    created_at: now,
  };
  return {
    ...db,
    tenants: [...db.tenants, tenant],
    members: [...db.members, member],
    fields: [...db.fields, ...copyFields(id)],
    lookups: [...db.lookups, ...copyLookups(id)],
    activeTenantId: id,
    audit: [
      auditEntry({
        tenantId: id,
        actor,
        table: "tenants",
        rowId: id,
        action: "insert",
        before: null,
        after: { ...tenant },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function setServiceCodeMode(db: CatalogDb, mode: ServiceCodeMode, now = new Date().toISOString()): CatalogDb {
  const tenantId = requireActive(db);
  return {
    ...db,
    tenants: db.tenants.map((tenant) =>
      tenant.id === tenantId ? { ...tenant, service_code_mode: mode, updated_at: now } : tenant,
    ),
  };
}

export function loadSampleServices(db: CatalogDb, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  const existing = db.services.filter((service) => service.tenant_id === tenantId);
  if (existing.length > 0) {
    throw new Error("Starter services can only be loaded into an empty workspace.");
  }
  const created = STARTER_PACK.map((seed) =>
    buildService(tenantId, { ...seed, id: crypto.randomUUID() }, now),
  ).map((service) => ({
    ...service,
    created_by: actor.userId,
    updated_by: actor.userId,
  }));
  const entries = created.map((service) =>
    auditEntry({
      tenantId,
      actor,
      table: "services",
      rowId: service.id,
      action: "insert",
      before: null,
      after: serviceRecordData(service),
      now,
    }),
  );
  return {
    ...db,
    services: [...db.services, ...created],
    audit: [...entries.reverse(), ...db.audit],
  };
}

export function saveService(db: CatalogDb, input: ServiceRecord, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  if (input.tenant_id !== tenantId) throw new Error("That service belongs to another workspace.");
  const normalized = normalizeService({
    ...input,
    updated_at: now,
    updated_by: actor.userId,
  });
  const duplicate = db.services.some(
    (service) =>
      service.tenant_id === tenantId &&
      service.id !== normalized.id &&
      service.service_code.toLowerCase() === normalized.service_code.toLowerCase(),
  );
  if (duplicate) throw new Error("That service code is already used in this workspace.");
  const current = db.services.find((service) => service.id === normalized.id);
  const nextService: ServiceRecord = current
    ? normalized
    : { ...normalized, created_at: now, created_by: actor.userId };
  const services = current
    ? db.services.map((service) => (service.id === nextService.id ? nextService : service))
    : [...db.services, nextService];
  return {
    ...db,
    services,
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "services",
        rowId: nextService.id,
        action: current ? "update" : "insert",
        before: current ? serviceRecordData(current) : null,
        after: serviceRecordData(nextService),
        now,
      }),
      ...db.audit,
    ],
  };
}

export function saveLookup(db: CatalogDb, input: LookupOption, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  const current = db.lookups.find((option) => option.id === input.id && option.tenant_id === tenantId);
  if (!current) throw new Error("That dropdown option is not in this workspace.");
  const next: LookupOption = {
    ...current,
    label: input.label.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    code_prefix: input.code_prefix?.trim() ? input.code_prefix.trim().toUpperCase() : null,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : current.sort_order,
    is_active: input.is_active,
  };
  if (!next.label) throw new Error("A label is required.");
  return {
    ...db,
    lookups: db.lookups.map((option) => (option.id === next.id ? next : option)),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "lookup_options",
        rowId: next.id,
        action: "update",
        before: { ...current },
        after: { ...next },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function addLookup(
  db: CatalogDb,
  input: { field_key: string; code: string; label: string; description: string; code_prefix: string; sort_order: number },
  now = new Date().toISOString(),
): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  const code = input.code.trim().toLowerCase();
  const label = input.label.trim();
  if (!/^[a-z0-9_]+$/.test(code)) {
    throw new Error("Codes use lowercase letters, numbers, and underscores.");
  }
  if (!label) throw new Error("A label is required.");
  const taken = db.lookups.some(
    (option) => option.tenant_id === tenantId && option.field_key === input.field_key && option.code === code,
  );
  if (taken) throw new Error("That code already exists for this dropdown.");
  const option: LookupOption = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    field_key: input.field_key,
    code,
    label,
    description: input.description.trim() || null,
    code_prefix: input.code_prefix.trim() ? input.code_prefix.trim().toUpperCase() : null,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 100,
    is_active: true,
  };
  return {
    ...db,
    lookups: [...db.lookups, option],
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "lookup_options",
        rowId: option.id,
        action: "insert",
        before: null,
        after: { ...option },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function saveField(db: CatalogDb, input: FieldDefinition, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  const current = db.fields.find((field) => field.id === input.id && field.tenant_id === tenantId);
  if (!current) throw new Error("That field is not in this workspace.");
  if (isIdentityField(current.field_key) && input.is_active === false) {
    throw new Error("Service code and name stay active so every service remains identifiable.");
  }
  const next: FieldDefinition = {
    ...current,
    label: input.label.trim() || current.label,
    help_text: input.help_text,
    visibility: input.visibility,
    depth_level: input.depth_level,
    is_required: input.is_required,
    is_active: input.is_active,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : current.sort_order,
  };
  return {
    ...db,
    fields: db.fields.map((field) => (field.id === next.id ? next : field)),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "field_definitions",
        rowId: next.id,
        action: "update",
        before: { ...current },
        after: { ...next },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function addMember(db: CatalogDb, email: string, role: Role, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  if (role === "platform_owner") {
    throw new Error("Demo Mode keeps a single local platform owner. Member invites apply when Supabase Auth is connected.");
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("Enter an email address.");
  const existing = db.members.find(
    (member) => member.tenant_id === tenantId && member.email.toLowerCase() === normalized,
  );
  if (existing) {
    return {
      ...db,
      members: db.members.map((member) => (member.id === existing.id ? { ...member, role } : member)),
    };
  }
  const member: Member = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    email: normalized,
    role,
    created_at: now,
  };
  return {
    ...db,
    members: [...db.members, member],
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "tenant_members",
        rowId: member.id,
        action: "insert",
        before: null,
        after: { email: member.email, role: member.role },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function setTenantLogo(db: CatalogDb, logoUrl: string | null, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertAdmin(db, tenantId, actor.userId, "Only a workspace admin can change the company logo.");
  const nextLogo = normalizeLogoInput(logoUrl);
  const current = db.tenants.find((tenant) => tenant.id === tenantId);
  if (!current) throw new Error("Choose a workspace.");
  if ((current.logo_url ?? null) === nextLogo) return db;
  const next: Tenant = { ...current, logo_url: nextLogo, updated_at: now };
  return {
    ...db,
    tenants: db.tenants.map((tenant) => (tenant.id === tenantId ? next : tenant)),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "tenants",
        rowId: tenantId,
        action: "update",
        before: { name: current.name, logo_url: current.logo_url },
        after: { name: next.name, logo_url: next.logo_url },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function setServiceArchived(
  db: CatalogDb,
  serviceId: string,
  archived: boolean,
  now = new Date().toISOString(),
): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertWrite(db, tenantId, actor.userId);
  const current = db.services.find((service) => service.id === serviceId && service.tenant_id === tenantId);
  if (!current) throw new Error("That service is not in this workspace.");
  if (Boolean(current.archived_at) === archived) return db;
  const next: ServiceRecord = withComputed({
    ...current,
    archived_at: archived ? now : null,
    updated_at: now,
    updated_by: actor.userId,
  });
  return {
    ...db,
    services: db.services.map((service) => (service.id === next.id ? next : service)),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "services",
        rowId: next.id,
        action: "update",
        before: serviceRecordData(current),
        after: serviceRecordData(next),
        now,
      }),
      ...db.audit,
    ],
  };
}

export function deleteService(db: CatalogDb, serviceId: string, now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertAdmin(db, tenantId, actor.userId, "Only a workspace admin can permanently delete a service.");
  const current = db.services.find((service) => service.id === serviceId && service.tenant_id === tenantId);
  if (!current) throw new Error("That service is not in this workspace.");
  return {
    ...db,
    services: db.services.filter((service) => service.id !== serviceId),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "services",
        rowId: serviceId,
        action: "delete",
        before: serviceRecordData(current),
        after: null,
        now,
      }),
      ...db.audit,
    ],
  };
}

export function importLookups(
  db: CatalogDb,
  fieldKey: string,
  rows: Array<{ code: string; label: string; description: string | null; code_prefix: string | null }>,
  now = new Date().toISOString(),
): { db: CatalogDb; created: number; updated: number } {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertAdmin(db, tenantId, actor.userId, "Only a workspace admin can import dropdown options.");
  const group = fieldKey.trim();
  if (!group) throw new Error("Choose a lookup group.");
  const existing = db.lookups.filter((option) => option.tenant_id === tenantId && option.field_key === group);
  const byCode = new Map(existing.map((option) => [option.code, option]));
  let maxSort = existing.reduce((max, option) => Math.max(max, option.sort_order), 0);
  const nextLookups = db.lookups.slice();
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const code = row.code.trim().toLowerCase();
    const label = row.label.trim();
    if (!label || !/^[a-z0-9_]+$/.test(code)) continue;
    const description = row.description?.trim() ? row.description.trim() : null;
    const prefix = group === "category" && row.code_prefix?.trim() ? row.code_prefix.trim().toUpperCase() : null;
    const current = byCode.get(code);
    if (current) {
      const next = {
        ...current,
        label,
        description,
        code_prefix: group === "category" ? prefix : current.code_prefix,
        is_active: true,
      };
      const index = nextLookups.findIndex((option) => option.id === current.id);
      if (index >= 0) nextLookups[index] = next;
      byCode.set(code, next);
      updated += 1;
    } else {
      maxSort += 10;
      const option = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        field_key: group,
        code,
        label,
        description,
        code_prefix: prefix,
        sort_order: maxSort,
        is_active: true,
      };
      nextLookups.push(option);
      byCode.set(code, option);
      created += 1;
    }
  }
  if (created === 0 && updated === 0) return { db, created, updated };
  return {
    db: {
      ...db,
      lookups: nextLookups,
      audit: [
        auditEntry({
          tenantId,
          actor,
          table: "lookup_options",
          rowId: tenantId,
          action: "insert",
          before: null,
          after: { kind: "lookup_import", field_key: group, created, updated },
          now,
        }),
        ...db.audit,
      ],
    },
    created,
    updated,
  };
}

export function checkoutServices(
  db: CatalogDb,
  incoming: ServiceRecord[],
  now = new Date().toISOString(),
): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertWrite(db, tenantId, actor.userId);
  if (incoming.length === 0) throw new Error("The cart is empty.");
  const taken = new Set(
    db.services.filter((service) => service.tenant_id === tenantId).map((service) => service.service_code.toLowerCase()),
  );
  const stamped = incoming.map((service) => {
    if (service.tenant_id !== tenantId) throw new Error("That service belongs to another workspace.");
    const code = service.service_code.trim();
    if (!code) throw new Error("Every service needs a code.");
    if (taken.has(code.toLowerCase())) throw new Error(`Service code ${code} is already used in this workspace.`);
    taken.add(code.toLowerCase());
    return {
      ...service,
      service_code: code,
      created_at: now,
      updated_at: now,
      created_by: actor.userId,
      updated_by: actor.userId,
      archived_at: null,
    };
  });
  return {
    ...db,
    services: [...db.services, ...stamped],
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "services",
        rowId: stamped[0]?.id ?? tenantId,
        action: "insert",
        before: null,
        after: {
          kind: "blueprint_checkout",
          count: stamped.length,
          service_codes: stamped.map((service) => service.service_code),
          names: stamped.map((service) => service.name),
        },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function setCatalogColumns(db: CatalogDb, keys: string[], now = new Date().toISOString()): CatalogDb {
  const actor = requireSession(db);
  const tenantId = requireActive(db);
  assertAdmin(db, tenantId, actor.userId, "Only a workspace admin can save the catalog column default.");
  const clean = keys.filter((key) => key.trim().length > 0);
  if (clean.length === 0) throw new Error("Choose at least one column.");
  const current = db.tenants.find((tenant) => tenant.id === tenantId);
  if (!current) throw new Error("Choose a workspace.");
  const next = { ...current, catalog_columns: { keys: clean }, updated_at: now };
  return {
    ...db,
    tenants: db.tenants.map((tenant) => (tenant.id === tenantId ? next : tenant)),
    audit: [
      auditEntry({
        tenantId,
        actor,
        table: "tenants",
        rowId: tenantId,
        action: "update",
        before: { catalog_columns: current.catalog_columns },
        after: { catalog_columns: next.catalog_columns },
        now,
      }),
      ...db.audit,
    ],
  };
}

export function resetDemo(db: CatalogDb): CatalogDb {
  const fresh = freshDemo();
  if (!db.session) return fresh;
  return signInDemo(fresh, db.session.email);
}

export function roleFor(db: CatalogDb, tenantId: string | null, userId: string | null): Role | null {
  if (!tenantId || !userId) return null;
  const direct = db.members.find((member) => member.tenant_id === tenantId && member.user_id === userId);
  if (direct) return direct.role;
  if (db.members.some((member) => member.user_id === userId && member.role === "platform_owner")) {
    return "platform_owner";
  }
  return null;
}

function copyFields(tenantId: string): FieldDefinition[] {
  return materializeFields(tenantId, (fieldKey) => `field:${tenantId}:${fieldKey}`);
}

function copyLookups(tenantId: string): LookupOption[] {
  return STARTER_LOOKUPS.map((seed) => ({
    id: `lookup:${tenantId}:${seed.field_key}:${seed.code}`,
    tenant_id: tenantId,
    field_key: seed.field_key,
    code: seed.code,
    label: seed.label,
    description: seed.description,
    code_prefix: seed.code_prefix,
    sort_order: seed.sort_order,
    is_active: true,
  }));
}

function requireSession(db: CatalogDb): SessionUser {
  if (!db.session) throw new Error("Sign in first.");
  return db.session;
}

function requireActive(db: CatalogDb): string {
  if (!db.activeTenantId) throw new Error("Choose a workspace.");
  return db.activeTenantId;
}

function assertWrite(db: CatalogDb, tenantId: string, userId: string): void {
  if (!canWriteServices(roleFor(db, tenantId, userId))) {
    throw new Error("You do not have permission to change services in this workspace.");
  }
}

function assertAdmin(db: CatalogDb, tenantId: string, userId: string, message: string): void {
  if (!canAdminister(roleFor(db, tenantId, userId))) throw new Error(message);
}

function auditEntry(args: {
  tenantId: string;
  actor: SessionUser;
  table: string;
  rowId: string;
  action: AuditEntry["action"];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  now: string;
}): AuditEntry {
  return {
    id: crypto.randomUUID(),
    tenant_id: args.tenantId,
    actor_user_id: args.actor.userId,
    actor_label: args.actor.email,
    table_name: args.table,
    row_id: args.rowId,
    action: args.action,
    before_data: args.before,
    after_data: args.after,
    created_at: args.now,
  };
}

function serviceRecordData(service: ServiceRecord): Record<string, unknown> {
  return { ...withComputed(service) };
}
