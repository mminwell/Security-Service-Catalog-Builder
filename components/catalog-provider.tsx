"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveServiceAction,
  checkoutBlueprintsAction,
  createWorkspaceAction,
  renameWorkspaceAction,
  deleteArtifactAction,
  deleteArtifactLinkAction,
  deleteExportProfileAction,
  deleteServiceAction,
  importArtifactsAction,
  importFrameworkAction,
  importLookupsAction,
  insertLookupAction,
  inviteMemberAction,
  loadSampleCatalogAction,
  recordExportAction,
  removeOutcomeMappingAction,
  saveArtifactAction,
  saveArtifactLinkAction,
  saveCatalogColumnsAction,
  saveExportProfilesAction,
  saveProfileAction,
  saveFieldAction,
  saveFieldsAction,
  saveLookupAction,
  saveOutcomeMappingAction,
  saveServiceAction,
  setServiceCodeModeAction,
  setTenantLogoAction,
} from "@/app/actions/catalog";
import { friendlyAuthError } from "@/lib/auth/messages";
import { normalizeEmail, validateEmail, validatePassword } from "@/lib/auth/credentials";
import {
  browserPromptStore,
  clearProfilePromptDismissal,
  normalizeAccountProfile,
  signupUserMetadata,
  type AccountProfileInput,
} from "@/lib/auth/profile";
import { canAdminister, canGrantPlatformOwner, canProvision, canWriteServices, roleLabel } from "@/lib/catalog/access";
import { serviceHasOwnerGap } from "@/lib/catalog/owner-names";
import { canEditServiceContent } from "@/lib/catalog/service-edit";
import { planBlueprintCheckout } from "@/lib/catalog/checkout";
import type { ExportLogMeta } from "@/lib/catalog/export-plan";
import type { FieldGroupId } from "@/lib/catalog/fields";
import { isIdentityField } from "@/lib/catalog/fields";
import type { PlannedElement } from "@/lib/catalog/framework-import";
import type { ExportProfile, Invitation } from "@/lib/catalog/types";
import { optionByCode } from "@/lib/catalog/lookups";
import { localToday } from "@/lib/catalog/present";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type { PlannedArtifactImport } from "@/lib/catalog/artifacts";
import type {
  Artifact,
  ArtifactLink,
  FieldDefinition,
  LookupOption,
  Member,
  OutcomeMapping,
  OwnerHistoryEntry,
  Role,
  ServiceCodeMode,
  ServiceOwner,
  ServiceRecord,
  Tenant,
} from "@/lib/catalog/types";
import {
  importArtifacts as importArtifactRows,
  roleFor,
  saveExportProfile as saveExportProfileRow,
  setFieldLookup as setFieldLookupRow,
  saveOutcomeMapping as saveOutcomeMappingRow,
  saveArtifact as saveArtifactRow,
  saveArtifactLink as saveArtifactLinkRow,
  setFieldGroup as setFieldGroupRow,
  switchTenant as switchTenantRow,
  type CatalogDb,
} from "@/lib/data/model";
import { hydrateFromSupabase, isMissingUserProfilesError } from "@/lib/data/remote";
import { writeActiveTenantId } from "@/lib/data/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { ActionResult } from "@/lib/server/result";

export type CatalogApi = {
  ready: boolean;
  error: string | null;
  warning: string | null;
  clearError: () => void;
  session: CatalogDb["session"];
  tenants: Tenant[];
  activeTenant: Tenant | null;
  role: Role | null;
  canWrite: boolean;
  canAdmin: boolean;
  canCreateWorkspace: boolean;
  canGrantOwner: boolean;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  services: ServiceRecord[];
  artifacts: Artifact[];
  artifactLinks: ArtifactLink[];
  framework: FrameworkRelease | null;
  frameworks: FrameworkRelease[];
  elements: FrameworkElement[];
  mappings: OutcomeMapping[];
  exportProfiles: ExportProfile[];
  audit: AuditEntryLike[];
  members: Member[];
  invitations: Invitation[];
  owners: ServiceOwner[];
  ownerHistory: OwnerHistoryEntry[];
  ownersReady: boolean;
  ownerReminderDue: boolean;
  canEditService: (serviceId: string) => boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: AccountProfileInput & { email: string; password: string }) => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  saveProfile: (input: AccountProfileInput) => Promise<void>;
  signOut: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  createTenant: (name: string) => Promise<void>;
  setServiceCodeMode: (mode: ServiceCodeMode) => Promise<void>;
  loadSampleServices: () => Promise<void>;
  saveService: (service: ServiceRecord) => Promise<string>;
  saveArtifact: (artifact: Artifact) => Promise<string>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  saveArtifactLink: (input: { id?: string; artifactId: string; serviceId: string; relationshipNote?: string | null }) => Promise<void>;
  deleteArtifactLink: (linkId: string) => Promise<void>;
  importArtifacts: (rows: PlannedArtifactImport[]) => Promise<{ created: number; updated: number }>;
  saveLookup: (option: LookupOption) => Promise<void>;
  addLookup: (input: {
    field_key: string;
    code: string;
    label: string;
    description: string;
    code_prefix: string;
    sort_order: number;
  }) => Promise<void>;
  saveField: (field: FieldDefinition) => Promise<void>;
  setFieldLookup: (fieldId: string, enabled: boolean) => Promise<void>;
  addMember: (email: string, role: Role) => Promise<string>;
  setTenantLogo: (logoUrl: string | null) => Promise<void>;
  renameWorkspace: (name: string) => Promise<void>;
  archiveService: (serviceId: string, archived: boolean) => Promise<ServiceRecord>;
  deleteService: (serviceId: string) => Promise<void>;
  importLookups: (
    fieldKey: string,
    rows: Array<{ code: string; label: string; description: string | null; code_prefix: string | null }>,
  ) => Promise<{ created: number; updated: number }>;
  checkoutBlueprints: (input: {
    blueprintIds: string[];
    status: string;
    ownerTeam: string;
    deliveryTeam: string | null;
  }) => Promise<void>;
  saveCatalogColumns: (keys: string[]) => Promise<void>;
  setFieldGroup: (group: FieldGroupId, active: boolean) => Promise<void>;
  saveExportProfile: (input: {
    id?: string;
    name: string;
    audience: "public" | "internal";
    fieldKeys: string[];
    isDefault: boolean;
  }) => Promise<void>;
  deleteExportProfile: (profileId: string) => Promise<void>;
  importFramework: (frameworkId: string, planned: PlannedElement[]) => Promise<void>;
  recordExport: (meta: ExportLogMeta) => Promise<void>;
  saveOutcomeMapping: (input: {
    serviceId: string;
    elementId: string;
    coverage: string;
    rationale?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  removeOutcomeMapping: (mappingId: string) => Promise<void>;
};

type AuditEntryLike = CatalogDb["audit"][number];

const CatalogContext = createContext<CatalogApi | null>(null);

export function CatalogFixture({ api, children }: { api: CatalogApi; children: ReactNode }) {
  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<CatalogDb | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [owners, setOwners] = useState<ServiceOwner[]>([]);
  const [ownerHistory, setOwnerHistory] = useState<OwnerHistoryEntry[]>([]);
  const [ownersReady, setOwnersReady] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const reload = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const result = await hydrateFromSupabase(supabase);
    setDb(result.db);
    setInvitations(result.invitations);
    setOwners(result.owners);
    setOwnerHistory(result.ownerHistory);
    setOwnersReady(result.ownersReady);
    setLoadedAt(Date.now());
    setWarning(result.warning);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createBrowserSupabase();
        supabaseRef.current = supabase;
        const result = await hydrateFromSupabase(supabase);
        if (!cancelled) {
          setDb(result.db);
          setInvitations(result.invitations);
          setOwners(result.owners);
          setOwnerHistory(result.ownerHistory);
          setOwnersReady(result.ownersReady);
          setLoadedAt(Date.now());
          setWarning(result.warning);
        }
      } catch (err) {
        if (!cancelled) setError(messageOf(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((next: CatalogDb) => {
    setDb(next);
  }, []);

  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      setError(null);
      return await action();
    } catch (err) {
      const message = messageOf(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const api = useMemo<CatalogApi>(() => {
    const session = db?.session ?? null;
    const tenants = db?.tenants ?? [];
    const activeTenant = tenants.find((tenant) => tenant.id === db?.activeTenantId) ?? null;
    const tenantId = activeTenant?.id ?? null;
    const role = db && session ? roleFor(db, tenantId, session.userId) : null;
    const fields = db?.fields.filter((field) => field.tenant_id === tenantId) ?? [];
    const lookups = db?.lookups.filter((option) => option.tenant_id === tenantId) ?? [];
    const services = (db?.services.filter((service) => service.tenant_id === tenantId) ?? []).map((service) => ({
      ...service,
      owner_gap: serviceHasOwnerGap(
        service,
        owners
          .filter((owner) => owner.tenant_id === tenantId)
          .map((owner) => ({ id: owner.id, isActive: owner.is_active, deactivatedUser: owner.deactivated_user })),
        ownersReady,
      ),
    }));
    const artifacts = db?.artifacts.filter((artifact) => artifact.tenant_id === tenantId) ?? [];
    const artifactLinks = db?.artifactLinks.filter((link) => link.tenant_id === tenantId) ?? [];
    const mappings = db?.mappings.filter((mapping) => mapping.tenant_id === tenantId) ?? [];
    const exportProfiles = db?.exportProfiles.filter((profile) => profile.tenant_id === tenantId) ?? [];
    const audit = db?.audit.filter((entry) => entry.tenant_id === tenantId) ?? [];
    const members = db?.members.filter((member) => member.tenant_id === tenantId) ?? [];
    const pendingInvites = invitations.filter((invite) => invite.tenant_id === tenantId);
    const tenantOwners = owners.filter((owner) => owner.tenant_id === tenantId);
    const seenAt = activeTenant?.owner_reminder_seen_at ? Date.parse(activeTenant.owner_reminder_seen_at) : Number.NaN;
    const reminderDue = Boolean(
      loadedAt != null &&
        ownersReady &&
        activeTenant?.owner_reminder_enabled &&
        (role === "tenant_admin" || role === "platform_owner") &&
        (Number.isNaN(seenAt) || loadedAt - seenAt > 30 * 24 * 60 * 60 * 1000),
    );

    return {
      ready,
      error,
      warning,
      clearError: () => setError(null),
      session,
      tenants,
      activeTenant,
      role,
      canWrite: canWriteServices(role),
      canAdmin: canAdminister(role),
      canCreateWorkspace: canProvision(role),
      canGrantOwner: canGrantPlatformOwner(role),
      fields,
      lookups,
      services,
      artifacts,
      artifactLinks,
      framework: db?.frameworks.find((item) => item.is_active && item.code === "NIST-CSF") ?? null,
      frameworks: db?.frameworks.filter((item) => item.is_active && item.code === "NIST-CSF") ?? [],
      elements: db?.elements ?? [],
      mappings,
      exportProfiles,
      audit,
      members,
      invitations: pendingInvites,
      owners: tenantOwners,
      ownerHistory: ownerHistory.filter((entry) => entry.tenant_id === tenantId),
      ownersReady,
      ownerReminderDue: reminderDue,
      canEditService: (serviceId: string) => {
        const service = services.find((item) => item.id === serviceId);
        const owner = tenantOwners.find((item) => item.id === service?.owner_id);
        return canEditServiceContent({
          role,
          userId: session?.userId ?? null,
          ownerUserId: owner?.user_id ?? null,
          ownerActive: Boolean(owner?.is_active),
          ownerDeactivated: Boolean(owner?.deactivated_user),
        });
      },
      refresh: () => guard(async () => {
        await reload();
      }),
      signIn: (email, password) =>
        guard(async () => {
          const emailError = validateEmail(email);
          if (emailError) throw new Error(emailError);
          const passwordError = validatePassword(password);
          if (passwordError) throw new Error(passwordError);
          const supabase = browserSupabase(supabaseRef);
          const { error: signError } = await supabase.auth.signInWithPassword({
            email: normalizeEmail(email),
            password,
          });
          if (signError) throw new Error(friendlyAuthError(signError.message));
          await reload();
        }),
      signUp: ({ firstName, lastName, email, company, password }) =>
        guard(async () => {
          const profile = normalizeAccountProfile({ firstName, lastName, company });
          const emailError = validateEmail(email);
          if (emailError) throw new Error(emailError);
          const passwordError = validatePassword(password);
          if (passwordError) throw new Error(passwordError);
          const supabase = browserSupabase(supabaseRef);
          const origin = window.location.origin;
          const { data, error: signError } = await supabase.auth.signUp({
            email: normalizeEmail(email),
            password,
            options: {
              emailRedirectTo: `${origin}/auth/callback?next=/catalog`,
              data: signupUserMetadata(profile),
            },
          });
          if (signError) throw new Error(friendlyAuthError(signError.message));
          if (!data.session || !data.user) return "Check your email to confirm the account, then sign in.";
          const { error: profileError } = await supabase.from("user_profiles").upsert({
            user_id: data.user.id,
            first_name: profile.firstName,
            last_name: profile.lastName,
            company: profile.company,
            updated_at: new Date().toISOString(),
          });
          if (profileError && !isMissingUserProfilesError(profileError.message)) {
            throw new Error(profileError.message);
          }
          await reload();
          return null;
        }),
      saveProfile: (input) =>
        guard(async () => {
          await unwrap(saveProfileAction(input));
          await reload();
        }),
      requestPasswordReset: (email) =>
        guard(async () => {
          const emailError = validateEmail(email);
          if (emailError) throw new Error(emailError);
          const supabase = browserSupabase(supabaseRef);
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
          });
          if (resetError && /rate/i.test(resetError.message)) throw new Error(friendlyAuthError(resetError.message));
        }),
      updatePassword: (password) =>
        guard(async () => {
          const passwordError = validatePassword(password);
          if (passwordError) throw new Error(passwordError);
          const supabase = browserSupabase(supabaseRef);
          const { data } = await supabase.auth.getUser();
          if (!data.user) throw new Error("Open the reset link from your email, then choose a new password.");
          const { error: updateError } = await supabase.auth.updateUser({ password });
          if (updateError) throw new Error(friendlyAuthError(updateError.message));
        }),
      signOut: () =>
        guard(async () => {
          const store = browserPromptStore();
          if (store) clearProfilePromptDismissal(store);
          await supabaseRef.current?.auth.signOut();
          setDb((current) => (current ? { ...current, session: null } : current));
          setInvitations([]);
          setWarning(null);
        }),
      switchTenant: (nextId: string) => {
        if (!db) return;
        writeActiveTenantId(nextId);
        commit(switchTenantRow(db, nextId));
      },
      createTenant: (name: string) =>
        guard(async () => {
          const created = await unwrap(createWorkspaceAction(name));
          writeActiveTenantId(created.id);
          await reload();
        }),
      setServiceCodeMode: (nextMode: ServiceCodeMode) =>
        guard(async () => {
          if (!tenantId) return;
          await unwrap(setServiceCodeModeAction(tenantId, nextMode));
          await reload();
        }),
      loadSampleServices: () =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace first.");
          await unwrap(loadSampleCatalogAction(tenantId));
          await reload();
        }),
      saveService: (service: ServiceRecord) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          await unwrap(saveServiceAction(service));
          await reload();
          return service.id;
        }),
      saveLookup: (option: LookupOption) =>
        guard(async () => {
          await unwrap(saveLookupAction(option));
          await reload();
        }),
      addLookup: (input) =>
        guard(async () => {
          if (!tenantId) return;
          const option: LookupOption = {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            field_key: input.field_key,
            code: input.code.trim().toLowerCase(),
            label: input.label.trim(),
            description: input.description.trim() || null,
            code_prefix: input.code_prefix.trim() ? input.code_prefix.trim().toUpperCase() : null,
            sort_order: input.sort_order,
            is_active: true,
          };
          await unwrap(insertLookupAction(option));
          await reload();
        }),
      setFieldLookup: (fieldId, enabled) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = setFieldLookupRow(db, fieldId, enabled);
          const saved = next.fields.find((field) => field.id === fieldId);
          if (!saved) throw new Error("That field is not in this workspace.");
          await unwrap(saveFieldAction(saved));
          await reload();
        }),
      saveField: (field: FieldDefinition) =>
        guard(async () => {
          if (isIdentityField(field.field_key) && field.is_active === false) {
            throw new Error("Service code and name stay active so every service remains identifiable.");
          }
          await unwrap(saveFieldAction(field));
          await reload();
        }),
      addMember: (email: string, memberRole: Role) =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace.");
          const result = await unwrap(inviteMemberAction(tenantId, email, memberRole));
          await reload();
          return result.notice || (result.status === "invited"
            ? `Invitation saved as ${roleLabel(memberRole)}.`
            : `Added as ${roleLabel(memberRole)}.`);
        }),
      setTenantLogo: (logoUrl: string | null) =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace.");
          await unwrap(setTenantLogoAction(tenantId, logoUrl));
          await reload();
        }),
      renameWorkspace: (name: string) =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace.");
          await unwrap(renameWorkspaceAction(tenantId, name));
          await reload();
        }),
      archiveService: (serviceId: string, archived: boolean) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const now = new Date().toISOString();
          await unwrap(archiveServiceAction(serviceId, archived ? now : null));
          await reload();
          const current = db.services.find((service) => service.id === serviceId);
          if (!current) throw new Error("That service is not in this workspace.");
          return { ...current, archived_at: archived ? now : null, updated_at: now };
        }),
      deleteService: (serviceId: string) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          if (!canAdminister(role)) throw new Error("Only an Admin can permanently delete a service.");
          await unwrap(deleteServiceAction(serviceId));
          await reload();
        }),
      importLookups: (fieldKey, rows) =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace.");
          const result = await unwrap(importLookupsAction(tenantId, fieldKey, rows));
          await reload();
          return result;
        }),
      checkoutBlueprints: (input) =>
        guard(async () => {
          if (!db || !tenantId || !activeTenant) throw new Error("Choose a workspace.");
          const tenantLookups = db.lookups.filter((option) => option.tenant_id === tenantId);
          const planned = planBlueprintCheckout({
            tenantId,
            blueprintIds: input.blueprintIds,
            mode: activeTenant.service_code_mode,
            status: input.status || "draft",
            ownerTeam: input.ownerTeam,
            deliveryTeam: input.deliveryTeam,
            existingCodes: db.services.filter((service) => service.tenant_id === tenantId).map((service) => service.service_code),
            prefixForCategory: (category) => optionByCode(tenantLookups, "category", category)?.code_prefix ?? null,
            reviewedOn: localToday(),
            now: new Date().toISOString(),
          });
          if (planned.length === 0) throw new Error("Nothing in the cart matches a blueprint.");
          await unwrap(checkoutBlueprintsAction(tenantId, planned));
          await reload();
        }),
      saveOutcomeMapping: (input) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = saveOutcomeMappingRow(db, input);
          const mapping = next.mappings.find(
            (item) => item.service_id === input.serviceId && item.element_id === input.elementId,
          );
          if (!mapping) throw new Error("The assessment could not be saved.");
          await unwrap(saveOutcomeMappingAction(mapping));
          await reload();
        }),
      removeOutcomeMapping: (mappingId: string) =>
        guard(async () => {
          await unwrap(removeOutcomeMappingAction(mappingId));
          await reload();
        }),
      setFieldGroup: (group, active) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("The catalog is still loading.");
          const next = setFieldGroupRow(db, group, active);
          const changed = next.fields.filter((field) => field.tenant_id === tenantId && field.field_group === group);
          await unwrap(saveFieldsAction(changed));
          await reload();
        }),
      saveExportProfile: (input) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("The catalog is still loading.");
          const next = saveExportProfileRow(db, input);
          const saved = next.exportProfiles.find(
            (profile) => profile.tenant_id === tenantId && profile.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
          );
          if (!saved) throw new Error("The profile could not be saved.");
          const profiles = [saved];
          if (saved.is_default) {
            for (const profile of next.exportProfiles) {
              if (profile.tenant_id === tenantId && profile.id !== saved.id && profile.is_default === false) {
                const previous = db.exportProfiles.find((item) => item.id === profile.id);
                if (previous?.is_default) profiles.push(profile);
              }
            }
          }
          await unwrap(saveExportProfilesAction(profiles));
          await reload();
        }),
      deleteExportProfile: (profileId) =>
        guard(async () => {
          await unwrap(deleteExportProfileAction(profileId));
          await reload();
        }),
      importFramework: (frameworkId, planned) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("The catalog is still loading.");
          const framework = db.frameworks.find((item) => item.id === frameworkId);
          if (!framework) throw new Error("That framework is not available.");
          await unwrap(importFrameworkAction(tenantId, frameworkId, framework.version, planned));
          await reload();
        }),
      recordExport: (meta) =>
        guard(async () => {
          if (!tenantId) throw new Error("The catalog is still loading.");
          await unwrap(recordExportAction(tenantId, meta));
          await reload();
        }),
      saveCatalogColumns: (keys) =>
        guard(async () => {
          if (!tenantId) throw new Error("Choose a workspace.");
          await unwrap(saveCatalogColumnsAction(tenantId, keys));
          await reload();
        }),
      saveArtifact: (artifact) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = saveArtifactRow(db, artifact);
          const saved = next.artifacts.find((row) => row.id === artifact.id);
          if (!saved) throw new Error("Could not save that artifact.");
          await unwrap(saveArtifactAction(saved));
          await reload();
          return artifact.id;
        }),
      deleteArtifact: (artifactId) =>
        guard(async () => {
          await unwrap(deleteArtifactAction(artifactId));
          await reload();
        }),
      saveArtifactLink: (input) =>
        guard(async () => {
          if (!db) return;
          const next = saveArtifactLinkRow(db, input);
          const saved = next.artifactLinks.find(
            (link) => link.artifact_id === input.artifactId && link.service_id === input.serviceId,
          );
          if (!saved) throw new Error("Could not save that link.");
          await unwrap(saveArtifactLinkAction(saved));
          await reload();
        }),
      deleteArtifactLink: (linkId) =>
        guard(async () => {
          await unwrap(deleteArtifactLinkAction(linkId));
          await reload();
        }),
      importArtifacts: (rows) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("The catalog is still loading.");
          const result = importArtifactRows(db, rows);
          const saved = rows.flatMap((row) => {
            const artifact = result.db.artifacts.find(
              (item) => item.tenant_id === tenantId && item.name.toLowerCase() === row.name.toLowerCase(),
            );
            return artifact ? [artifact] : [];
          });
          await unwrap(importArtifactsAction(tenantId, saved));
          await reload();
          return { created: result.created, updated: result.updated };
        }),
    };
  }, [db, invitations, owners, ownerHistory, ownersReady, loadedAt, ready, error, warning, commit, guard, reload]);

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider");
  return value;
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

function browserSupabase(ref: { current: SupabaseClient | null }): SupabaseClient {
  const supabase = ref.current ?? createBrowserSupabase();
  ref.current = supabase;
  return supabase;
}

async function unwrap<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const resolved = await result;
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.data;
}
