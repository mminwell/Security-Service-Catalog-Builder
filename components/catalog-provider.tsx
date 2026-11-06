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
import { canAdminister, canProvision, canWriteServices } from "@/lib/catalog/access";
import { planBlueprintCheckout } from "@/lib/catalog/checkout";
import type { ExportLogMeta } from "@/lib/catalog/export-plan";
import type { FieldGroupId } from "@/lib/catalog/fields";
import { isIdentityField } from "@/lib/catalog/fields";
import type { PlannedElement } from "@/lib/catalog/framework-import";
import type { ExportProfile } from "@/lib/catalog/types";
import { optionByCode } from "@/lib/catalog/lookups";
import { normalizeLogoInput } from "@/lib/catalog/logos";
import { localToday } from "@/lib/catalog/present";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type {
  FieldDefinition,
  LookupOption,
  Member,
  OutcomeMapping,
  Role,
  ServiceCodeMode,
  ServiceRecord,
  Tenant,
} from "@/lib/catalog/types";
import {
  addLookup as addLookupRow,
  addMember as addMemberRow,
  createTenant as createTenantRow,
  loadSampleServices as loadSampleRows,
  checkoutServices,
  deleteExportProfile as deleteExportProfileRow,
  deleteService as deleteServiceRecord,
  importFrameworkRows,
  importLookups as importLookupRowsModel,
  removeOutcomeMapping as removeOutcomeMappingRow,
  resetDemo,
  roleFor,
  recordExport as recordExportRow,
  saveExportProfile as saveExportProfileRow,
  saveField as saveFieldRow,
  saveLookup as saveLookupRow,
  saveOutcomeMapping as saveOutcomeMappingRow,
  saveService as saveServiceRow,
  setServiceArchived,
  setCatalogColumns as setCatalogColumnsRow,
  setFieldGroup as setFieldGroupRow,
  setServiceCodeMode as setModeRow,
  setTenantLogo as setTenantLogoRow,
  signInDemo,
  signOutDemo,
  switchTenant as switchTenantRow,
  type CatalogDb,
} from "@/lib/data/model";
import {
  checkoutBlueprintRows,
  deleteExportProfileRow as deleteExportProfileRemote,
  deleteOutcomeMappingRow as deleteOutcomeMappingRemote,
  deleteServiceRow,
  hydrateFromSupabase,
  importFrameworkRowsRemote,
  logCatalogExport,
  persistExportProfile,
  importLookupRows,
  insertLookup,
  persistCatalogColumns,
  persistField,
  persistLookup,
  persistOutcomeMapping,
  persistService,
  persistServiceArchived,
  persistTenantLogo,
  persistTenantMode,
} from "@/lib/data/remote";
import { loadDemoDb, persistDemoDb, writeActiveTenantId } from "@/lib/data/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { uniqueSlug } from "@/lib/catalog/service-code";

type CatalogApi = {
  ready: boolean;
  mode: "demo" | "supabase";
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
  fields: FieldDefinition[];
  lookups: LookupOption[];
  services: ServiceRecord[];
  framework: FrameworkRelease | null;
  frameworks: FrameworkRelease[];
  elements: FrameworkElement[];
  mappings: OutcomeMapping[];
  exportProfiles: ExportProfile[];
  audit: AuditEntryLike[];
  members: Member[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  createTenant: (name: string) => Promise<void>;
  setServiceCodeMode: (mode: ServiceCodeMode) => Promise<void>;
  loadSampleServices: () => Promise<void>;
  saveService: (service: ServiceRecord) => Promise<string>;
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
  addMember: (email: string, role: Role) => Promise<void>;
  setTenantLogo: (logoUrl: string | null) => Promise<void>;
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
  resetDemoData: () => void;
};

type AuditEntryLike = CatalogDb["audit"][number];

const CatalogContext = createContext<CatalogApi | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const mode = isSupabaseConfigured() ? "supabase" : "demo";
  const [db, setDb] = useState<CatalogDb | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (mode === "demo") {
          const next = loadDemoDb();
          persistDemoDb(next);
          if (!cancelled) setDb(next);
          return;
        }
        const supabase = createBrowserSupabase();
        supabaseRef.current = supabase;
        const result = await hydrateFromSupabase(supabase);
        if (!cancelled) {
          setDb(result.db);
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
  }, [mode]);

  const commit = useCallback(
    (next: CatalogDb) => {
      setDb(next);
      if (mode === "demo") persistDemoDb(next);
    },
    [mode],
  );

  const reload = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const result = await hydrateFromSupabase(supabase);
    setDb(result.db);
    setWarning(result.warning);
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
    const services = db?.services.filter((service) => service.tenant_id === tenantId) ?? [];
    const mappings = db?.mappings.filter((mapping) => mapping.tenant_id === tenantId) ?? [];
    const exportProfiles = db?.exportProfiles.filter((profile) => profile.tenant_id === tenantId) ?? [];
    const audit = db?.audit.filter((entry) => entry.tenant_id === tenantId) ?? [];
    const members = db?.members.filter((member) => member.tenant_id === tenantId) ?? [];

    return {
      ready,
      mode,
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
      fields,
      lookups,
      services,
      framework: db?.frameworks.find((item) => item.is_active && item.code === "NIST-CSF") ?? null,
      frameworks: db?.frameworks.filter((item) => item.is_active) ?? [],
      elements: db?.elements ?? [],
      mappings,
      exportProfiles,
      audit,
      members,
      signIn: (email, password) =>
        guard(async () => {
          if (mode === "demo") {
            if (!db) return;
            void password;
            commit(signInDemo(db, email));
            return;
          }
          const supabase = supabaseRef.current ?? createBrowserSupabase();
          supabaseRef.current = supabase;
          const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
          if (signError) throw new Error(signError.message);
          await reload();
        }),
      signUp: (email, password) =>
        guard(async () => {
          if (mode === "demo") {
            if (!db) return null;
            commit(signInDemo(db, email));
            return null;
          }
          const supabase = supabaseRef.current ?? createBrowserSupabase();
          supabaseRef.current = supabase;
          const { data, error: signError } = await supabase.auth.signUp({ email, password });
          if (signError) throw new Error(signError.message);
          if (!data.session) {
            return "Check your email to confirm the account, then sign in. For a local project, turn off email confirmation in the Supabase Auth settings.";
          }
          await reload();
          return null;
        }),
      signOut: () =>
        guard(async () => {
          if (mode === "demo") {
            if (db) commit(signOutDemo(db));
            return;
          }
          await supabaseRef.current?.auth.signOut();
          setDb((current) => (current ? { ...current, session: null } : current));
          setWarning(null);
        }),
      switchTenant: (nextId: string) => {
        if (!db) return;
        writeActiveTenantId(nextId);
        commit(switchTenantRow(db, nextId));
      },
      createTenant: (name: string) =>
        guard(async () => {
          if (!db) return;
          if (mode === "demo") {
            const next = createTenantRow(db, name);
            commit(next);
            if (next.activeTenantId) writeActiveTenantId(next.activeTenantId);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const slug = uniqueSlug(
            name,
            db.tenants.map((tenant) => tenant.slug),
          );
          const { data, error: rpcError } = await supabase.rpc("provision_tenant", {
            p_name: name.trim(),
            p_slug: slug,
          });
          if (rpcError) throw new Error(rpcError.message);
          if (typeof data === "string") writeActiveTenantId(data);
          await reload();
        }),
      setServiceCodeMode: (nextMode: ServiceCodeMode) =>
        guard(async () => {
          if (!db || !tenantId) return;
          if (mode === "demo") {
            commit(setModeRow(db, nextMode));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistTenantMode(supabase, tenantId, nextMode);
          await reload();
        }),
      loadSampleServices: () =>
        guard(async () => {
          if (!db) return;
          if (mode === "demo") {
            commit(loadSampleRows(db));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase || !tenantId) throw new Error("Choose a workspace first.");
          const { error: rpcError } = await supabase.rpc("load_starter_sample_services", {
            p_tenant_id: tenantId,
          });
          if (rpcError) throw new Error(rpcError.message);
          await reload();
        }),
      saveService: (service: ServiceRecord) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          if (mode === "demo") {
            commit(saveServiceRow(db, service));
            return service.id;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistService(supabase, service);
          await reload();
          return service.id;
        }),
      saveLookup: (option: LookupOption) =>
        guard(async () => {
          if (!db) return;
          if (mode === "demo") {
            commit(saveLookupRow(db, option));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistLookup(supabase, option);
          await reload();
        }),
      addLookup: (input) =>
        guard(async () => {
          if (!db || !tenantId) return;
          if (mode === "demo") {
            commit(addLookupRow(db, input));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const code = input.code.trim().toLowerCase();
          const option: LookupOption = {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            field_key: input.field_key,
            code,
            label: input.label.trim(),
            description: input.description.trim() || null,
            code_prefix: input.code_prefix.trim() ? input.code_prefix.trim().toUpperCase() : null,
            sort_order: input.sort_order,
            is_active: true,
          };
          await insertLookup(supabase, option);
          await reload();
        }),
      saveField: (field: FieldDefinition) =>
        guard(async () => {
          if (!db) return;
          if (isIdentityField(field.field_key) && field.is_active === false) {
            throw new Error("Service code and name stay active so every service remains identifiable.");
          }
          if (mode === "demo") {
            commit(saveFieldRow(db, field));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistField(supabase, field);
          await reload();
        }),
      addMember: (email: string, memberRole: Role) =>
        guard(async () => {
          if (!db || !tenantId) return;
          if (mode === "demo") {
            commit(addMemberRow(db, email, memberRole));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const { error: rpcError } = await supabase.rpc("add_tenant_member", {
            p_tenant: tenantId,
            p_email: email.trim(),
            p_role: memberRole,
          });
          if (rpcError) throw new Error(rpcError.message);
          await reload();
        }),
      setTenantLogo: (logoUrl: string | null) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("Choose a workspace.");
          const normalized = normalizeLogoInput(logoUrl);
          if (mode === "demo") {
            commit(setTenantLogoRow(db, normalized));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistTenantLogo(supabase, tenantId, normalized);
          await reload();
        }),
      archiveService: (serviceId: string, archived: boolean) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          if (mode === "demo") {
            const next = setServiceArchived(db, serviceId, archived);
            commit(next);
            const saved = next.services.find((service) => service.id === serviceId);
            if (!saved) throw new Error("That service is not in this workspace.");
            return saved;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const now = new Date().toISOString();
          await persistServiceArchived(supabase, serviceId, archived ? now : null);
          await reload();
          const current = db.services.find((service) => service.id === serviceId);
          if (!current) throw new Error("That service is not in this workspace.");
          return { ...current, archived_at: archived ? now : null, updated_at: now };
        }),
      deleteService: (serviceId: string) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          if (!canAdminister(role)) {
            throw new Error("Only a workspace admin can permanently delete a service.");
          }
          if (mode === "demo") {
            commit(deleteServiceRecord(db, serviceId));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await deleteServiceRow(supabase, serviceId);
          await reload();
        }),
      importLookups: (fieldKey, rows) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("Choose a workspace.");
          if (mode === "demo") {
            const result = importLookupRowsModel(db, fieldKey, rows);
            commit(result.db);
            return { created: result.created, updated: result.updated };
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const result = await importLookupRows(supabase, tenantId, fieldKey, rows);
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
          if (mode === "demo") {
            commit(checkoutServices(db, planned));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await checkoutBlueprintRows(supabase, tenantId, planned);
          await reload();
        }),
      saveOutcomeMapping: (input) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = saveOutcomeMappingRow(db, input);
          if (mode === "demo") {
            commit(next);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          const mapping = next.mappings.find(
            (item) => item.service_id === input.serviceId && item.element_id === input.elementId,
          );
          if (!mapping) throw new Error("The assessment could not be saved.");
          await persistOutcomeMapping(supabase, mapping);
          await reload();
        }),
      removeOutcomeMapping: (mappingId: string) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = removeOutcomeMappingRow(db, mappingId);
          if (mode === "demo") {
            commit(next);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await deleteOutcomeMappingRemote(supabase, mappingId);
          await reload();
        }),
      setFieldGroup: (group, active) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          if (mode === "demo") {
            commit(setFieldGroupRow(db, group, active));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase || !tenantId) throw new Error("Supabase is not connected.");
          const next = setFieldGroupRow(db, group, active);
          const changed = next.fields.filter((field) => field.tenant_id === tenantId && field.field_group === group);
          for (const field of changed) await persistField(supabase, field);
          await reload();
        }),
      saveExportProfile: (input) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = saveExportProfileRow(db, input);
          if (mode === "demo") {
            commit(next);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase || !tenantId) throw new Error("Supabase is not connected.");
          const saved = next.exportProfiles.find(
            (profile) => profile.tenant_id === tenantId && profile.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
          );
          if (!saved) throw new Error("The profile could not be saved.");
          await persistExportProfile(supabase, saved);
          if (saved.is_default) {
            for (const profile of next.exportProfiles) {
              if (profile.tenant_id === tenantId && profile.id !== saved.id && profile.is_default === false) {
                const previous = db.exportProfiles.find((item) => item.id === profile.id);
                if (previous?.is_default) await persistExportProfile(supabase, profile);
              }
            }
          }
          await reload();
        }),
      deleteExportProfile: (profileId) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const next = deleteExportProfileRow(db, profileId);
          if (mode === "demo") {
            commit(next);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await deleteExportProfileRemote(supabase, profileId);
          await reload();
        }),
      importFramework: (frameworkId, planned) =>
        guard(async () => {
          if (!db) throw new Error("The catalog is still loading.");
          const framework = db.frameworks.find((item) => item.id === frameworkId);
          const next = importFrameworkRows(db, frameworkId, planned);
          if (mode === "demo") {
            commit(next);
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase || !tenantId || !framework) throw new Error("Supabase is not connected.");
          await importFrameworkRowsRemote(supabase, tenantId, frameworkId, framework.version, planned);
          await reload();
        }),
      recordExport: (meta) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("The catalog is still loading.");
          if (mode === "demo") {
            commit(recordExportRow(db, meta));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await logCatalogExport(supabase, tenantId, meta);
          await reload();
        }),
      saveCatalogColumns: (keys) =>
        guard(async () => {
          if (!db || !tenantId) throw new Error("Choose a workspace.");
          if (mode === "demo") {
            commit(setCatalogColumnsRow(db, keys));
            return;
          }
          const supabase = supabaseRef.current;
          if (!supabase) throw new Error("Supabase is not connected.");
          await persistCatalogColumns(supabase, tenantId, keys);
          await reload();
        }),
      resetDemoData: () => {
        if (!db || mode !== "demo") return;
        const next = resetDemo(db);
        commit(next);
      },
    };
  }, [db, ready, mode, error, warning, commit, guard, reload]);

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
