"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readableInviteError } from "@/lib/auth/invites";
import { normalizeEmail, validateEmail } from "@/lib/auth/credentials";
import { normalizeAccountProfile } from "@/lib/auth/profile";
import { canAdminister, canGrantPlatformOwner, canProvision, canWriteServices, roleLabel } from "@/lib/catalog/access";
import { planBlueprintCheckout } from "@/lib/catalog/checkout";
import { isIdentityField } from "@/lib/catalog/fields";
import { optionByCode } from "@/lib/catalog/lookups";
import { presentedServiceOwner, serviceHasOwnerGap } from "@/lib/catalog/owner-names";
import { localToday } from "@/lib/catalog/present";
import { canEditServiceContent } from "@/lib/catalog/service-edit";
import type { ExportLogMeta } from "@/lib/catalog/export-plan";
import type { FieldGroupId } from "@/lib/catalog/fields";
import type { PlannedElement } from "@/lib/catalog/framework-import";
import type { PlannedArtifactImport } from "@/lib/catalog/artifacts";
import type {
  Artifact,
  FieldDefinition,
  LookupOption,
  Role,
  ServiceCodeMode,
  ServiceRecord,
} from "@/lib/catalog/types";
import { installDemoMemoryStorage } from "@/lib/demo/memory-storage";
import { applyDemoCommand, initialDemo, type DemoCommand, type DemoResult, type DemoSnapshot } from "@/lib/demo/store";
import {
  checkoutServices,
  createTenant as createTenantRow,
  deleteArtifact as deleteArtifactRow,
  deleteArtifactLink as deleteArtifactLinkRow,
  deleteExportProfile as deleteExportProfileRow,
  deleteService as deleteServiceRow,
  importArtifacts as importArtifactRows,
  importFrameworkRows,
  importServices as importServiceRows,
  importLookups as importLookupRows,
  loadSampleServices as loadSampleServicesRow,
  recordExport as recordExportRow,
  removeOutcomeMapping as removeOutcomeMappingRow,
  renameWorkspace as renameWorkspaceRow,
  roleFor,
  saveArtifact as saveArtifactRow,
  saveArtifactLink as saveArtifactLinkRow,
  saveExportProfile as saveExportProfileRow,
  saveField as saveFieldRow,
  saveLookup as saveLookupRow,
  saveOutcomeMapping as saveOutcomeMappingRow,
  saveService as saveServiceRow,
  setCatalogColumns,
  setFieldGroup as setFieldGroupRow,
  setFieldLookup as setFieldLookupRow,
  setServiceArchived,
  setServiceCodeMode as setServiceCodeModeRow,
  setTenantLogo as setTenantLogoRow,
  switchTenant as switchTenantRow,
  addLookup as addLookupRow,
  type CatalogDb,
} from "@/lib/data/model";
import { CatalogContext, type CatalogApi } from "@/components/catalog-provider";
import { useSaveToast } from "@/components/save-toast";

export function DemoCatalogProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(initialDemo);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const toast = useSaveToast();

  useEffect(() => installDemoMemoryStorage(), []);

  const commit = useCallback((next: DemoSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const commitDb = useCallback(
    (db: CatalogDb) => {
      commit({ ...snapshotRef.current, db });
    },
    [commit],
  );

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

  const guardSave = useCallback(
    async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
      try {
        setError(null);
        const value = await action();
        toast.success(label);
        return value;
      } catch (err) {
        const message = messageOf(err);
        toast.error(message);
        throw new Error(message);
      }
    },
    [toast],
  );

  const api = useMemo<CatalogApi>(() => {
    const db = snapshot.db;
    const session = db.session;
    const tenants = db.tenants;
    const activeTenant = tenants.find((tenant) => tenant.id === db.activeTenantId) ?? null;
    const tenantId = activeTenant?.id ?? null;
    const role = session ? roleFor(db, tenantId, session.userId) : null;
    const fields = db.fields.filter((field) => field.tenant_id === tenantId);
    const lookups = db.lookups.filter((option) => option.tenant_id === tenantId);
    const tenantOwners = snapshot.owners.filter((owner) => owner.tenant_id === tenantId);
    const services = db.services
      .filter((service) => service.tenant_id === tenantId)
      .map((service) => ({
        ...service,
        service_owner: presentedServiceOwner(service, tenantOwners),
        owner_gap: serviceHasOwnerGap(
          service,
          tenantOwners.map((owner) => ({ id: owner.id, isActive: owner.is_active, deactivatedUser: owner.deactivated_user })),
          true,
        ),
      }));

    return {
      ready: true,
      demo: true,
      error,
      warning: null,
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
      artifacts: db.artifacts.filter((artifact) => artifact.tenant_id === tenantId),
      artifactLinks: db.artifactLinks.filter((link) => link.tenant_id === tenantId),
      framework: db.frameworks.find((item) => item.is_active && item.code === "NIST-CSF") ?? null,
      frameworks: db.frameworks.filter((item) => item.is_active && item.code === "NIST-CSF"),
      elements: db.elements,
      mappings: db.mappings.filter((mapping) => mapping.tenant_id === tenantId),
      exportProfiles: db.exportProfiles.filter((profile) => profile.tenant_id === tenantId),
      audit: db.audit.filter((entry) => entry.tenant_id === tenantId),
      members: db.members.filter((member) => member.tenant_id === tenantId),
      invitations: snapshot.invitations.filter((invite) => invite.tenant_id === tenantId && !invite.cancelled_at),
      owners: tenantOwners,
      ownerHistory: snapshot.ownerHistory.filter((entry) => entry.tenant_id === tenantId),
      ownersReady: true,
      ownerReminderDue: false,
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
      refresh: async () => undefined,
      demoDispatch: (command: DemoCommand): DemoResult => {
        const applied = applyDemoCommand(snapshotRef.current, command);
        commit(applied.state);
        return applied.result;
      },
      signIn: async () => {
        throw new Error("Leave the demo to sign in.");
      },
      signUp: async () => {
        throw new Error("Leave the demo to create an account.");
      },
      requestMagicLink: async () => {
        throw new Error("Leave the demo to request a sign-in link.");
      },
      requestPasswordReset: async () => {
        throw new Error("Leave the demo to reset a password.");
      },
      updatePassword: async () => {
        throw new Error("Leave the demo to change a password.");
      },
      saveProfile: (input) =>
        guardSave("Profile saved", async () => {
          const profile = normalizeAccountProfile(input);
          const current = snapshotRef.current;
          const userId = current.db.session?.userId;
          commit({
            ...current,
            db: {
              ...current.db,
              session: current.db.session
                ? { ...current.db.session, firstName: profile.firstName, lastName: profile.lastName, company: profile.company }
                : null,
              members: current.db.members.map((member) =>
                member.user_id === userId ? { ...member, first_name: profile.firstName, last_name: profile.lastName } : member,
              ),
            },
          });
        }),
      signOut: async () => {
        router.push("/login");
      },
      switchTenant: (nextId: string) => {
        commitDb(switchTenantRow(snapshotRef.current.db, nextId));
      },
      createTenant: (name: string) =>
        guardSave("Workspace created", async () => {
          const created = createTenantRow(snapshotRef.current.db, name);
          commitDb({
            ...created,
            members: created.members.map((member) =>
              member.tenant_id === created.activeTenantId ? { ...member, role: "tenant_admin" } : member,
            ),
          });
        }),
      setServiceCodeMode: (nextMode: ServiceCodeMode) =>
        guardSave("Service IDs saved", async () => {
          commitDb(setServiceCodeModeRow(snapshotRef.current.db, nextMode));
        }),
      loadSampleServices: () =>
        guardSave("Sample catalog loaded", async () => {
          commitDb(loadSampleServicesRow(snapshotRef.current.db));
        }),
      saveService: (service: ServiceRecord) =>
        guardSave("Service saved", async () => {
          commitDb(saveServiceRow(snapshotRef.current.db, service));
          return service.id;
        }),
      saveLookup: (option: LookupOption) =>
        guardSave("Lookup saved", async () => {
          commitDb(saveLookupRow(snapshotRef.current.db, option));
        }),
      addLookup: (input) =>
        guardSave("Lookup saved", async () => {
          commitDb(addLookupRow(snapshotRef.current.db, input));
        }),
      setFieldLookup: (fieldId, enabled) =>
        guardSave("Field saved", async () => {
          commitDb(setFieldLookupRow(snapshotRef.current.db, fieldId, enabled));
        }),
      saveField: (field: FieldDefinition) =>
        guardSave("Field saved", async () => {
          if (isIdentityField(field.field_key) && field.is_active === false) {
            throw new Error("Service code and name stay active so every service remains identifiable.");
          }
          commitDb(saveFieldRow(snapshotRef.current.db, field));
        }),
      addMember: (email: string, memberRole: Role) =>
        (async () => {
          try {
            if (!tenantId) throw new Error("Choose a workspace.");
            if (memberRole === "platform_owner") throw new Error("The demo cannot grant platform owner.");
            const emailError = validateEmail(email);
            if (emailError) throw new Error(emailError);
            const current = snapshotRef.current;
            const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            commit({
              ...current,
              invitations: [
                ...current.invitations,
                {
                  id: crypto.randomUUID(),
                  tenant_id: tenantId,
                  email: normalizeEmail(email),
                  role: memberRole,
                  created_at: new Date().toISOString(),
                  expires_at: expires,
                  cancelled_at: null,
                },
              ],
            });
            const notice = `Invitation kept in this browser as ${roleLabel(memberRole)}. Demo mode does not send email.`;
            toast.success(notice);
            return notice;
          } catch (err) {
            const message = readableInviteError(messageOf(err));
            toast.error(message);
            throw new Error(message);
          }
        })(),
      setTenantLogo: (logoUrl: string | null) =>
        guardSave("Logo saved", async () => {
          commitDb(setTenantLogoRow(snapshotRef.current.db, logoUrl));
        }),
      renameWorkspace: (name: string) =>
        guardSave("Workspace renamed", async () => {
          commitDb(renameWorkspaceRow(snapshotRef.current.db, name));
        }),
      archiveService: (serviceId: string, archived: boolean) =>
        guardSave(archived ? "Service archived" : "Service restored", async () => {
          const next = setServiceArchived(snapshotRef.current.db, serviceId, archived);
          commitDb(next);
          const saved = next.services.find((service) => service.id === serviceId);
          if (!saved) throw new Error("That service is not in this workspace.");
          return saved;
        }),
      deleteService: (serviceId: string) =>
        guardSave("Service deleted", async () => {
          commitDb(deleteServiceRow(snapshotRef.current.db, serviceId));
        }),
      importLookups: (fieldKey, rows) =>
        guardSave("Lookups saved", async () => {
          const result = importLookupRows(snapshotRef.current.db, fieldKey, rows);
          commitDb(result.db);
          return { created: result.created, updated: result.updated };
        }),
      checkoutBlueprints: (input) =>
        guardSave("Services added", async () => {
          const current = snapshotRef.current.db;
          if (!tenantId || !activeTenant) throw new Error("Choose a workspace.");
          const tenantLookups = current.lookups.filter((option) => option.tenant_id === tenantId);
          const planned = planBlueprintCheckout({
            tenantId,
            blueprintIds: input.blueprintIds,
            mode: activeTenant.service_code_mode,
            status: input.status || "draft",
            ownerTeam: input.ownerTeam,
            deliveryTeam: input.deliveryTeam,
            existingCodes: current.services.filter((service) => service.tenant_id === tenantId).map((service) => service.service_code),
            prefixForCategory: (category) => optionByCode(tenantLookups, "category", category)?.code_prefix ?? null,
            reviewedOn: localToday(),
            now: new Date().toISOString(),
          });
          if (planned.length === 0) throw new Error("Nothing in the cart matches a blueprint.");
          commitDb(checkoutServices(current, planned));
        }),
      saveOutcomeMapping: (input) =>
        guardSave("Assessment saved", async () => {
          commitDb(saveOutcomeMappingRow(snapshotRef.current.db, input));
        }),
      removeOutcomeMapping: (mappingId: string) =>
        guardSave("Assessment removed", async () => {
          commitDb(removeOutcomeMappingRow(snapshotRef.current.db, mappingId));
        }),
      setFieldGroup: (group: FieldGroupId, active: boolean) =>
        guardSave("Fields saved", async () => {
          commitDb(setFieldGroupRow(snapshotRef.current.db, group, active));
        }),
      saveExportProfile: (input) =>
        guardSave("Export profile saved", async () => {
          commitDb(saveExportProfileRow(snapshotRef.current.db, input));
        }),
      deleteExportProfile: (profileId) =>
        guardSave("Export profile deleted", async () => {
          commitDb(deleteExportProfileRow(snapshotRef.current.db, profileId));
        }),
      importFramework: (frameworkId, planned: PlannedElement[]) =>
        guardSave("Framework saved", async () => {
          commitDb(importFrameworkRows(snapshotRef.current.db, frameworkId, planned));
        }),
      recordExport: (meta: ExportLogMeta) =>
        guard(async () => {
          commitDb(recordExportRow(snapshotRef.current.db, meta));
        }),
      saveCatalogColumns: (keys) =>
        guardSave("Columns saved", async () => {
          commitDb(setCatalogColumns(snapshotRef.current.db, keys));
        }),
      saveArtifact: (artifact: Artifact) =>
        guardSave("Artifact saved", async () => {
          commitDb(saveArtifactRow(snapshotRef.current.db, artifact));
          return artifact.id;
        }),
      deleteArtifact: (artifactId) =>
        guardSave("Artifact deleted", async () => {
          commitDb(deleteArtifactRow(snapshotRef.current.db, artifactId));
        }),
      saveArtifactLink: (input) =>
        guardSave("Artifact link saved", async () => {
          commitDb(saveArtifactLinkRow(snapshotRef.current.db, input));
        }),
      deleteArtifactLink: (linkId) =>
        guardSave("Artifact link removed", async () => {
          commitDb(deleteArtifactLinkRow(snapshotRef.current.db, linkId));
        }),
      importArtifacts: (rows: PlannedArtifactImport[]) =>
        guardSave("Artifacts saved", async () => {
          const result = importArtifactRows(snapshotRef.current.db, rows);
          commitDb(result.db);
          return { created: result.created, updated: result.updated };
        }),
      importServices: (rows) =>
        guardSave("Services saved", async () => {
          const result = importServiceRows(snapshotRef.current.db, rows);
          commitDb(result.db);
          return { created: result.created, updated: result.updated };
        }),
    };
  }, [snapshot, error, commit, commitDb, guard, guardSave, toast, router]);

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}
