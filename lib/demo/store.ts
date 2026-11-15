import { ownerDisplayName, replacementUpdates, type PlannedOwnerImport } from "@/lib/catalog/owner-names";
import { CSF_ELEMENTS } from "@/lib/catalog/framework";
import type {
  Invitation,
  OwnerHistoryEntry,
  Role,
  ServiceOwner,
  ServiceRecord,
} from "@/lib/catalog/types";
import { DEMO_USER_ID } from "@/lib/catalog/types";
import { freshDemo, signInDemo, type CatalogDb } from "@/lib/data/model";

const SEEDED_AT = "2026-11-01T15:00:00.000Z";
const DEMO_EMAIL = "avery.cole@example.com";
const MONITORING = "11111111-1111-4111-8111-111111111001";
const DETECT_OUTCOME = "e36f6f50-2e9a-53d0-afb7-2b1cd4872b74";

const PEOPLE = [
  {
    key: "rowan",
    first_name: "Rowan",
    last_name: "Hale",
    email: "rowan.hale@example.com",
    title: "SOC Manager",
    team_code: "soc",
  },
  {
    key: "amira",
    first_name: "Amira",
    last_name: "Okonkwo",
    email: "amira.okonkwo@example.com",
    title: "Identity Lead",
    team_code: "iam",
  },
  {
    key: "nils",
    first_name: "Nils",
    last_name: "Petrov",
    email: "nils.petrov@example.com",
    title: "Exposure Manager",
    team_code: "sec_engineering",
  },
  {
    key: "priya",
    first_name: "Priya",
    last_name: "Chen",
    email: "priya.chen@example.com",
    title: "Security Architect",
    team_code: "privacy_ai_gov",
  },
] as const;

const OWNER_IDS: Record<string, Record<(typeof PEOPLE)[number]["key"], string>> = {
  "11111111-1111-4111-8111-111111111111": {
    rowan: "11111111-1111-4111-8111-111111111201",
    amira: "11111111-1111-4111-8111-111111111202",
    nils: "11111111-1111-4111-8111-111111111203",
    priya: "11111111-1111-4111-8111-111111111204",
  },
  "22222222-2222-4222-8222-222222222222": {
    rowan: "22222222-2222-4222-8222-222222222201",
    amira: "22222222-2222-4222-8222-222222222202",
    nils: "22222222-2222-4222-8222-222222222203",
    priya: "22222222-2222-4222-8222-222222222204",
  },
};

const TEAM_OWNER: Record<string, (typeof PEOPLE)[number]["key"]> = {
  soc: "rowan",
  iam: "amira",
  sec_engineering: "nils",
  appsec: "nils",
  privacy_ai_gov: "priya",
};

export type DemoSnapshot = {
  db: CatalogDb;
  invitations: Invitation[];
  owners: ServiceOwner[];
  ownerHistory: OwnerHistoryEntry[];
};

export type DemoCommand =
  | {
      type: "settings";
      distributionPublic: string;
      distributionInternal: string;
      exportFormat: string;
      exportProfileId: string;
      reminderEnabled: boolean;
      markReminderSeen?: boolean;
    }
  | { type: "member-role"; userId: string; role: Role }
  | { type: "remove-member"; userId: string }
  | { type: "resend-invite"; inviteId: string }
  | { type: "cancel-invite"; inviteId: string }
  | {
      type: "save-owner";
      firstName: string;
      lastName: string;
      email: string;
      title: string;
      teamCode: string;
      userId: string;
    }
  | { type: "archive-owner"; ownerId: string; replacementId: string | null }
  | { type: "reactivate-owner"; ownerId: string }
  | { type: "import-owners"; rows: PlannedOwnerImport[] }
  | { type: "reconcile-owners"; ownerIds: string[]; replacementId: string | null };

export type DemoResult = { ok: true; notice: string; services: number } | { ok: false; error: string };

const EXPORT_FORMATS = ["csv", "xlsx", "docx", "pdf", "json"] as const;

/** Fictional catalog for /demo. A new call is the seed again; nothing here is persisted. */
export function initialDemo(): DemoSnapshot {
  const signed = signInDemo(freshDemo(), DEMO_EMAIL);
  const owners = signed.tenants.flatMap((tenant) =>
    PEOPLE.map((person) => ownerRecord(tenant.id, person, OWNER_IDS[tenant.id]?.[person.key] ?? "")),
  );
  const services = signed.services.map((service) => assignOwner(service, owners));
  const element = CSF_ELEMENTS.find((item) => item.id === DETECT_OUTCOME);
  const mappings = element
    ? [
        {
          id: "11111111-1111-4111-8111-111111111301",
          tenant_id: "11111111-1111-4111-8111-111111111111",
          service_id: MONITORING,
          element_id: element.id,
          coverage: "partial" as const,
          rationale: "Network detections are tuned for the priority accounts. New SaaS sources are still catching up.",
          notes: "Fictional sample assessment for the demo.",
          created_by: DEMO_USER_ID,
          updated_by: DEMO_USER_ID,
          created_at: SEEDED_AT,
          updated_at: SEEDED_AT,
        },
      ]
    : [];

  return {
    db: {
      ...signed,
      session: {
        userId: DEMO_USER_ID,
        email: DEMO_EMAIL,
        firstName: "Avery",
        lastName: "Cole",
        company: "Northwind Example",
      },
      members: signed.members.map((member) => ({
        ...member,
        role: "tenant_admin" as const,
        email: DEMO_EMAIL,
        first_name: "Avery",
        last_name: "Cole",
      })),
      services,
      mappings,
    },
    invitations: [],
    owners,
    ownerHistory: [],
  };
}

export function applyDemoCommand(state: DemoSnapshot, command: DemoCommand, now = new Date().toISOString()): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  const tenantId = state.db.activeTenantId;
  if (!tenantId) return { state, result: { ok: false, error: "Choose a workspace." } };

  switch (command.type) {
    case "settings":
      return {
        state: {
          ...state,
          db: {
            ...state.db,
            tenants: state.db.tenants.map((tenant) =>
              tenant.id === tenantId
                ? {
                    ...tenant,
                    distribution_public: blank(command.distributionPublic),
                    distribution_internal: blank(command.distributionInternal),
                    default_export_format: exportFormat(command.exportFormat),
                    default_export_profile_id: blank(command.exportProfileId),
                    owner_reminder_enabled: command.reminderEnabled,
                    owner_reminder_seen_at: command.markReminderSeen ? now : tenant.owner_reminder_seen_at,
                    updated_at: now,
                  }
                : tenant,
            ),
          },
        },
        result: { ok: true, notice: "Settings saved", services: 0 },
      };
    case "member-role":
      return setMemberRole(state, tenantId, command.userId, command.role);
    case "remove-member":
      return removeMember(state, tenantId, command.userId);
    case "resend-invite":
      return resendInvite(state, tenantId, command.inviteId, now);
    case "cancel-invite":
      return cancelInvite(state, tenantId, command.inviteId, now);
    case "save-owner":
      return saveOwner(state, tenantId, command, now);
    case "archive-owner":
      return archiveOwners(state, tenantId, [command.ownerId], command.replacementId, "archive", now);
    case "reactivate-owner":
      return reactivateOwner(state, tenantId, command.ownerId, now);
    case "import-owners":
      return importOwners(state, tenantId, command.rows, now);
    case "reconcile-owners":
      return archiveOwners(state, tenantId, command.ownerIds, command.replacementId, "reconcile", now);
    default:
      return { state, result: { ok: false, error: "That demo action is not recognized." } };
  }
}

function ownerRecord(
  tenantId: string,
  person: (typeof PEOPLE)[number],
  id: string,
): ServiceOwner {
  return {
    id,
    tenant_id: tenantId,
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    title: person.title,
    team_code: person.team_code,
    is_active: true,
    user_id: null,
    deactivated_user: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  };
}

function assignOwner(service: ServiceRecord, owners: ServiceOwner[]): ServiceRecord {
  const key = TEAM_OWNER[service.owner_team ?? ""] ?? "rowan";
  const owner = owners.find((item) => item.tenant_id === service.tenant_id && item.id === OWNER_IDS[service.tenant_id]?.[key]);
  if (!owner) return service;
  return {
    ...service,
    owner_id: owner.id,
    service_owner: ownerDisplayName(owner.first_name, owner.last_name),
    owner_needed: false,
    owner_review: null,
  };
}

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function exportFormat(value: string): "csv" | "xlsx" | "docx" | "pdf" | "json" | null {
  return EXPORT_FORMATS.find((format) => format === value) ?? null;
}

function tenantMembers(state: DemoSnapshot, tenantId: string) {
  return state.db.members.filter((member) => member.tenant_id === tenantId);
}

function setMemberRole(state: DemoSnapshot, tenantId: string, userId: string, role: Role): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  if (role === "platform_owner") {
    return { state, result: { ok: false, error: "The demo cannot grant platform owner." } };
  }
  const members = tenantMembers(state, tenantId);
  const current = members.find((member) => member.user_id === userId);
  if (!current) return { state, result: { ok: false, error: "That person is not in this workspace." } };
  const admins = members.filter((member) => member.role === "tenant_admin" || member.role === "platform_owner");
  const stillAdmin = role === "tenant_admin";
  if (!stillAdmin && (current.role === "tenant_admin" || current.role === "platform_owner") && admins.length < 2) {
    return { state, result: { ok: false, error: "The last Admin has to stay an Admin." } };
  }
  return {
    state: {
      ...state,
      db: {
        ...state.db,
        members: state.db.members.map((member) =>
          member.tenant_id === tenantId && member.user_id === userId ? { ...member, role } : member,
        ),
      },
    },
    result: { ok: true, notice: "Role saved", services: 0 },
  };
}

function removeMember(state: DemoSnapshot, tenantId: string, userId: string): { state: DemoSnapshot; result: DemoResult } {
  const members = tenantMembers(state, tenantId);
  const current = members.find((member) => member.user_id === userId);
  if (!current) return { state, result: { ok: false, error: "That person is not in this workspace." } };
  const admins = members.filter((member) => member.role === "tenant_admin" || member.role === "platform_owner");
  if ((current.role === "tenant_admin" || current.role === "platform_owner") && admins.length < 2) {
    return { state, result: { ok: false, error: "The last Admin cannot be removed." } };
  }
  return {
    state: {
      ...state,
      db: {
        ...state.db,
        members: state.db.members.filter((member) => !(member.tenant_id === tenantId && member.user_id === userId)),
      },
    },
    result: { ok: true, notice: "Removed from workspace", services: 0 },
  };
}

function resendInvite(state: DemoSnapshot, tenantId: string, inviteId: string, now: string): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  const invite = state.invitations.find((item) => item.id === inviteId && item.tenant_id === tenantId && !item.cancelled_at);
  if (!invite) return { state, result: { ok: false, error: "That invite is no longer pending." } };
  const expires = new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    state: {
      ...state,
      invitations: state.invitations.map((item) => (item.id === inviteId ? { ...item, expires_at: expires } : item)),
    },
    result: {
      ok: true,
      notice: "Demo mode does not send email. The invite expiry was refreshed in this browser.",
      services: 0,
    },
  };
}

function cancelInvite(state: DemoSnapshot, tenantId: string, inviteId: string, now: string): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  const invite = state.invitations.find((item) => item.id === inviteId && item.tenant_id === tenantId);
  if (!invite) return { state, result: { ok: false, error: "That invite is no longer pending." } };
  return {
    state: {
      ...state,
      invitations: state.invitations.map((item) => (item.id === inviteId ? { ...item, cancelled_at: now } : item)),
    },
    result: { ok: true, notice: "Invite cancelled", services: 0 },
  };
}

function saveOwner(
  state: DemoSnapshot,
  tenantId: string,
  command: Extract<DemoCommand, { type: "save-owner" }>,
  now: string,
): { state: DemoSnapshot; result: DemoResult } {
  const firstName = command.firstName.trim();
  const lastName = command.lastName.trim();
  if (!firstName || !lastName) return { state, result: { ok: false, error: "First name and last name are required." } };
  const email = command.email.trim().toLowerCase();
  if (command.userId && !email) {
    return { state, result: { ok: false, error: "An owner linked to a member needs an email." } };
  }
  const owner: ServiceOwner = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    first_name: firstName,
    last_name: lastName,
    email: email || null,
    title: command.title.trim() || null,
    team_code: command.teamCode.trim() || null,
    is_active: true,
    user_id: command.userId.trim() || null,
    deactivated_user: false,
    created_at: now,
    updated_at: now,
  };
  return {
    state: { ...state, owners: [...state.owners, owner] },
    result: { ok: true, notice: "Owner saved", services: 0 },
  };
}

function reactivateOwner(state: DemoSnapshot, tenantId: string, ownerId: string, now: string): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  const owner = state.owners.find((item) => item.id === ownerId && item.tenant_id === tenantId);
  if (!owner) return { state, result: { ok: false, error: "That owner is not in this workspace." } };
  return {
    state: {
      ...state,
      owners: state.owners.map((item) => (item.id === ownerId ? { ...item, is_active: true, updated_at: now } : item)),
    },
    result: { ok: true, notice: "Owner reactivated", services: 0 },
  };
}

function importOwners(state: DemoSnapshot, tenantId: string, rows: PlannedOwnerImport[], now: string): {
  state: DemoSnapshot;
  result: DemoResult;
} {
  const ready = rows.filter((row) => row.status === "ready" && row.firstName && row.lastName);
  const created: ServiceOwner[] = ready.map((row) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    first_name: row.firstName ?? "",
    last_name: row.lastName ?? "",
    email: row.email,
    title: row.title,
    team_code: row.teamCode,
    is_active: true,
    user_id: null,
    deactivated_user: false,
    created_at: now,
    updated_at: now,
  }));
  return {
    state: { ...state, owners: [...state.owners, ...created] },
    result: { ok: true, notice: `Imported ${created.length} owners.`, services: 0 },
  };
}

function archiveOwners(
  state: DemoSnapshot,
  tenantId: string,
  ownerIds: string[],
  replacementId: string | null,
  reason: "archive" | "reconcile",
  now: string,
): { state: DemoSnapshot; result: DemoResult } {
  const unique = [...new Set(ownerIds)];
  if (unique.length === 0) return { state, result: { ok: false, error: "Choose an owner to archive." } };
  if (replacementId && unique.includes(replacementId)) {
    return { state, result: { ok: false, error: "The replacement cannot be one of the owners being archived." } };
  }
  const replacement = replacementId
    ? state.owners.find((item) => item.id === replacementId && item.tenant_id === tenantId && item.is_active && !item.deactivated_user)
    : null;
  if (replacementId && !replacement) {
    return { state, result: { ok: false, error: "Choose an active replacement owner." } };
  }

  let next = state;
  let services = 0;
  for (const ownerId of unique) {
    const owner = next.owners.find((item) => item.id === ownerId && item.tenant_id === tenantId);
    if (!owner) return { state, result: { ok: false, error: "That owner is not in this workspace." } };
    const updates = replacementUpdates(
      next.db.services.filter((service) => service.tenant_id === tenantId).map((service) => ({
        id: service.id,
        ownerId: service.owner_id ?? null,
      })),
      ownerId,
      replacementId,
      reason,
    );
    services += updates.length;
    const history: OwnerHistoryEntry[] = updates.map((update) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      service_id: update.serviceId,
      actor_user_id: next.db.session?.userId ?? null,
      old_owner_id: update.previousOwnerId,
      new_owner_id: update.nextOwnerId,
      reason: update.reason,
      note: null,
      created_at: now,
    }));
    next = {
      ...next,
      owners: next.owners.map((item) => (item.id === ownerId ? { ...item, is_active: false, updated_at: now } : item)),
      ownerHistory: [...history, ...next.ownerHistory],
      db: {
        ...next.db,
        services: next.db.services.map((service) => {
          const update = updates.find((item) => item.serviceId === service.id);
          if (!update) return service;
          return {
            ...service,
            owner_id: update.nextOwnerId,
            owner_needed: update.ownerNeeded,
            service_owner: replacement ? ownerDisplayName(replacement.first_name, replacement.last_name) : service.service_owner,
            updated_at: now,
          };
        }),
      },
    };
  }
  const verb = reason === "reconcile" ? "Reconciled" : "Archived";
  return {
    state: next,
    result: { ok: true, notice: `${verb}. ${services} services updated.`, services },
  };
}
