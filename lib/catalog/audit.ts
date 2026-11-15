import type { AuditEntry, FieldDefinition } from "@/lib/catalog/types";

const SKIP = new Set([
  "id",
  "tenant_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

export type FieldChange = {
  key: string;
  label: string;
  from: string;
  to: string;
};

export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  labels: Map<string, string>,
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const fromValue = before?.[key] ?? null;
    const toValue = after?.[key] ?? null;
    if (stable(fromValue) === stable(toValue)) continue;
    changes.push({
      key,
      label: labels.get(key) ?? humanize(key),
      from: present(fromValue),
      to: present(toValue),
    });
  }
  return changes;
}

export type AuditPerson = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

const INTERNAL_KEYS = new Set([
  ...SKIP,
  "user_id",
  "owner_user_id",
  "owner_email",
  "token",
  "becomes_owner",
  "resent",
  "cancelled",
  "previous_owner_role",
  "slug",
  "active",
  "email",
  "role",
  "default_export_profile_id",
  "owner_reminder_seen_at",
]);

/** A sentence for one audit row. Unknown rows stay generic and never name a table or column. */
export function summarizeAudit(
  entry: AuditEntry,
  labels: Map<string, string>,
  people: readonly AuditPerson[] = [],
): { title: string; changes: FieldChange[] } {
  const table = entry.table_name;
  if (table === "tenant_members") return memberSentence(entry, people);
  if (table === "workspace_invitations") return inviteSentence(entry);
  if (table === "account_status") return accountSentence(entry, people);
  if (table === "tenants") return workspaceSentence(entry, labels, people);
  if (table === "services") return serviceSentence(entry, labels);
  if (table === "artifacts") return namedRecord(entry, "artifact");
  if (table === "lookup_options") return lookupSentence(entry, labels);
  if (table === "field_definitions") return namedRecord(entry, "field");
  if (table === "catalog_exports") return exportSentence(entry);
  if (table === "export_profiles") return profileSentence(entry);
  if (table === "service_outcome_mappings") return mappingSentence(entry, labels);
  return { title: genericAction(entry.action), changes: [] };
}

/** Name to show for the person who made the change. Email is the fallback. */
export function auditActorName(entry: AuditEntry, people: readonly AuditPerson[] = []): string {
  const email = entry.actor_label?.includes("@") ? entry.actor_label : "";
  const named = displayName(email, people);
  if (named) return named;
  const label = entry.actor_label?.trim();
  return label && label !== "system" ? label : "Someone";
}

/** Workspace name kept on a row after the workspace itself was deleted. */
export function deletedWorkspaceName(entry: AuditEntry, entries: readonly AuditEntry[]): string {
  if (entry.table_name === "tenants" && entry.action === "delete") {
    return textOf(entry.before_data?.name) || "Deleted workspace";
  }
  const id = textOf(entry.before_data?.tenant_id) || textOf(entry.after_data?.tenant_id);
  const match = entries.find((item) => {
    if (item.table_name !== "tenants" || item.action !== "delete") return false;
    return item.row_id === id || textOf(item.before_data?.tenant_id) === id;
  });
  return textOf(match?.before_data?.name) || "Deleted workspace";
}

export function labelMap(fields: FieldDefinition[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of fields) map.set(field.field_key, field.label);
  map.set("label", "Label");
  map.set("description", "Description");
  map.set("code_prefix", "Code prefix");
  map.set("sort_order", "Sort order");
  map.set("is_active", "Active");
  map.set("visibility", "Visibility");
  map.set("depth_level", "Depth");
  map.set("help_text", "Help text");
  map.set("lookup_bound", "Lookup");
  map.set("lookup_field_key", "Lookup group");
  map.set("lookup_restore", "Lookup restore");
  map.set("input_type", "Input");
  map.set("coverage", "Assessment");
  map.set("rationale", "Rationale");
  map.set("notes", "Notes");
  map.set("element_code", "Outcome");
  map.set("distribution_public", "Public distribution");
  map.set("distribution_internal", "Internal distribution");
  map.set("default_export_format", "Default export format");
  map.set("default_export_field_set", "Default field set");
  map.set("owner_reminder_enabled", "Owner reminder");
  return map;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function present(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanize(key: string): string {
  return key.replace(/_/g, " ");
}

function memberSentence(entry: AuditEntry, people: readonly AuditPerson[]): { title: string; changes: FieldChange[] } {
  const source = entry.action === "delete" ? entry.before_data : entry.after_data ?? entry.before_data;
  const who = personLabel(source, people);
  const next = roleName(textOf(entry.after_data?.role));
  const previous = roleName(textOf(entry.before_data?.role));
  if (entry.action === "delete") return { title: `Removed ${who} from the workspace`, changes: [] };
  if (entry.action === "insert") return { title: `Added ${who} as ${next || "a member"}`, changes: [] };
  if (previous && next && previous !== next) {
    return { title: `Changed ${possessive(who)} role from ${previous} to ${next}`, changes: [] };
  }
  return { title: `Updated ${possessive(who)} membership`, changes: [] };
}

function inviteSentence(entry: AuditEntry): { title: string; changes: FieldChange[] } {
  const email = textOf(entry.after_data?.email) || textOf(entry.before_data?.email) || "someone";
  const role = roleName(textOf(entry.after_data?.role) || textOf(entry.before_data?.role));
  const owner = entry.after_data?.becomes_owner === true || entry.before_data?.becomes_owner === true;
  if (entry.after_data?.cancelled === true) return { title: `Cancelled the invitation for ${email}`, changes: [] };
  if (entry.after_data?.resent === true) {
    return { title: owner ? `Resent the ownership invitation for ${email}` : `Resent the invitation for ${email}`, changes: [] };
  }
  if (owner && (entry.action === "insert" || entry.after_data?.becomes_owner === true)) {
    return { title: `Invited ${email} to become the owner`, changes: [] };
  }
  if (entry.action === "update") {
    const previous = roleName(textOf(entry.before_data?.role));
    if (previous && role && previous !== role) {
      return { title: `Changed the invitation for ${email} from ${previous} to ${role}`, changes: [] };
    }
  }
  return { title: role ? `Invited ${email} as ${role}` : `Invited ${email}`, changes: [] };
}

function accountSentence(entry: AuditEntry, people: readonly AuditPerson[]): { title: string; changes: FieldChange[] } {
  const who = personLabel(entry.after_data ?? entry.before_data, people);
  if (entry.action === "delete") return { title: `Deleted the account for ${who}`, changes: [] };
  if (entry.after_data?.active === false) return { title: `Deactivated ${who}`, changes: [] };
  if (entry.after_data?.active === true) return { title: `Reactivated ${who}`, changes: [] };
  return { title: `Updated the account for ${who}`, changes: [] };
}

function workspaceSentence(
  entry: AuditEntry,
  labels: Map<string, string>,
  people: readonly AuditPerson[],
): { title: string; changes: FieldChange[] } {
  const name = textOf(entry.before_data?.name) || textOf(entry.after_data?.name) || "the workspace";
  if (entry.action === "delete") return { title: `Deleted the workspace ${name}`, changes: [] };
  if (entry.action === "insert") return { title: `Created the workspace ${textOf(entry.after_data?.name) || name}`, changes: [] };
  const previousOwner = textOf(entry.before_data?.owner_email);
  const nextOwner = textOf(entry.after_data?.owner_email);
  if (nextOwner && nextOwner !== previousOwner) {
    const next = displayName(nextOwner, people) || nextOwner;
    const previous = previousOwner ? displayName(previousOwner, people) || previousOwner : "";
    return {
      title: previous ? `Transferred ownership from ${previous} to ${next}` : `Transferred ownership to ${next}`,
      changes: [],
    };
  }
  const previousName = textOf(entry.before_data?.name);
  const nextName = textOf(entry.after_data?.name);
  if (previousName && nextName && previousName !== nextName) {
    return { title: `Changed the company name from ${previousName} to ${nextName}`, changes: [] };
  }
  return { title: "Updated workspace settings", changes: friendlyChanges(entry.before_data, entry.after_data, labels) };
}

function serviceSentence(entry: AuditEntry, labels: Map<string, string>): { title: string; changes: FieldChange[] } {
  const source = entry.action === "delete" ? entry.before_data : entry.after_data ?? entry.before_data;
  const titled = servicePhrase(source);
  if (entry.action === "delete") return { title: titled ? `Deleted service ${titled}` : "Deleted a service", changes: [] };
  if (entry.action === "insert") return { title: titled ? `Added service ${titled}` : "Added a service", changes: [] };
  return {
    title: titled ? `Updated service ${titled}` : "Updated a service",
    changes: friendlyChanges(entry.before_data, entry.after_data, labels),
  };
}

function namedRecord(entry: AuditEntry, kind: string): { title: string; changes: FieldChange[] } {
  const source = entry.action === "delete" ? entry.before_data : entry.after_data ?? entry.before_data;
  const name = textOf(source?.name) || textOf(source?.label) || `a ${kind}`;
  if (entry.action === "delete") return { title: `Deleted ${kind} ${name}`, changes: [] };
  if (entry.action === "insert") return { title: `Added ${kind} ${name}`, changes: [] };
  return { title: `Updated ${kind} ${name}`, changes: [] };
}

function lookupSentence(entry: AuditEntry, labels: Map<string, string>): { title: string; changes: FieldChange[] } {
  const source = entry.action === "delete" ? entry.before_data : entry.after_data ?? entry.before_data;
  const label = textOf(source?.label) || "an option";
  const wasActive = entry.before_data?.is_active;
  const nowActive = entry.after_data?.is_active;
  if (wasActive === true && nowActive === false) return { title: `Retired ${label}`, changes: [] };
  if (wasActive === false && nowActive === true) return { title: `Reactivated ${label}`, changes: [] };
  if (entry.action === "delete") return { title: `Deleted the option ${label}`, changes: [] };
  if (entry.action === "insert") return { title: `Added the option ${label}`, changes: [] };
  return { title: `Updated the option ${label}`, changes: friendlyChanges(entry.before_data, entry.after_data, labels) };
}

function exportSentence(entry: AuditEntry): { title: string; changes: FieldChange[] } {
  const format = fileKind(textOf(entry.after_data?.format));
  const audience = textOf(entry.after_data?.audience) === "internal" ? "full" : "public";
  const rows = typeof entry.after_data?.row_count === "number" ? entry.after_data.row_count : null;
  const count = rows == null ? "" : rows === 1 ? ", 1 row" : `, ${rows} rows`;
  return { title: `Exported a ${audience} ${format}${count}`, changes: [] };
}

function profileSentence(entry: AuditEntry): { title: string; changes: FieldChange[] } {
  const name = textOf(entry.after_data?.name) || textOf(entry.before_data?.name) || "an export profile";
  if (entry.action === "delete") return { title: `Deleted the export profile ${name}`, changes: [] };
  if (entry.action === "insert") return { title: `Saved the export profile ${name}`, changes: [] };
  return { title: `Updated the export profile ${name}`, changes: [] };
}

function mappingSentence(entry: AuditEntry, labels: Map<string, string>): { title: string; changes: FieldChange[] } {
  const source = entry.action === "delete" ? entry.before_data : entry.after_data ?? entry.before_data;
  const code = textOf(source?.element_code) || "an outcome";
  const coverage = coverageName(textOf(source?.coverage));
  const service = textOf(source?.service_code);
  const onService = service ? ` on ${service}` : "";
  if (entry.action === "delete") return { title: `Removed the assessment for ${code}${onService}`, changes: [] };
  if (entry.action === "insert") {
    return { title: coverage ? `Mapped ${code} as ${coverage}${onService}` : `Mapped ${code}${onService}`, changes: [] };
  }
  return {
    title: coverage ? `Updated ${code} to ${coverage}${onService}` : `Updated the assessment for ${code}${onService}`,
    changes: friendlyChanges(entry.before_data, entry.after_data, labels),
  };
}

function genericAction(action: AuditEntry["action"]): string {
  if (action === "insert") return "Added a record";
  if (action === "delete") return "Deleted a record";
  return "Updated a record";
}

function friendlyChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  labels: Map<string, string>,
): FieldChange[] {
  return changedFields(before, after, labels)
    .filter((change) => !INTERNAL_KEYS.has(change.key) && labels.has(change.key))
    .map((change) => ({
      ...change,
      from: friendlyValue(change.key, change.from),
      to: friendlyValue(change.key, change.to),
    }));
}

function personLabel(data: Record<string, unknown> | null, people: readonly AuditPerson[]): string {
  const email = textOf(data?.email) || textOf(data?.owner_email);
  return displayName(email, people) || email || "someone";
}

function displayName(email: string, people: readonly AuditPerson[]): string {
  const match = people.find((person) => person.email && email && person.email.toLowerCase() === email.toLowerCase());
  const first = match?.firstName?.trim() ?? "";
  const last = match?.lastName?.trim() ?? "";
  if (first && last) return `${first} ${last}`;
  return "";
}

function possessive(name: string): string {
  return `${name}'s`;
}

function roleName(value: string): string {
  switch (value) {
    case "platform_owner":
      return "Site Admin";
    case "tenant_admin":
      return "Admin";
    case "editor":
      return "Editor";
    case "viewer":
      return "Viewer";
    case "service_manager":
      return "Service Manager";
    default:
      return "";
  }
}

function servicePhrase(data: Record<string, unknown> | null): string {
  const code = textOf(data?.service_code);
  const name = textOf(data?.name);
  return [code, name].filter(Boolean).join(" ");
}

function coverageName(value: string): string {
  if (value === "full") return "Full";
  if (value === "partial") return "Partial";
  if (value === "none") return "None";
  return "";
}

function fileKind(value: string): string {
  if (value === "csv") return "CSV";
  if (value === "xlsx") return "Excel file";
  if (value === "docx") return "Word file";
  if (value === "pdf") return "PDF";
  if (value === "json") return "JSON file";
  return "file";
}

function friendlyValue(key: string, value: string): string {
  if (key === "coverage") return coverageName(value) || value;
  if (key === "visibility") return value === "internal" ? "Internal" : value === "public" ? "Public" : value;
  return value;
}
