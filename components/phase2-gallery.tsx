"use client";

import { useState } from "react";
import { CatalogFixture, type CatalogApi } from "@/components/catalog-provider";
import { CatalogScreen } from "@/components/catalog-screen";
import { OwnersAdmin } from "@/components/owners-admin";
import { ServiceForm } from "@/components/service-form";
import { SiteUsers } from "@/components/site-users";
import { WorkspaceSettings } from "@/components/workspace-settings";
import { materializeFields } from "@/lib/catalog/fields";
import { blankService } from "@/lib/catalog/service";
import type { Invitation, Member, OwnerHistoryEntry, ServiceOwner, SiteAccount, Tenant } from "@/lib/catalog/types";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-11-13T15:00:00.000Z";

const tenant: Tenant = {
  id: TENANT,
  slug: "northwind",
  name: "Northwind Security",
  service_code_mode: "sequential",
  logo_url: null,
  catalog_columns: null,
  distribution_public: null,
  distribution_internal: null,
  default_export_format: "pdf",
  default_export_profile_id: null,
  owner_reminder_enabled: true,
  owner_reminder_seen_at: null,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
};

const members: Member[] = [
  {
    id: "m1",
    tenant_id: TENANT,
    user_id: "11111111-1111-4111-8111-111111111111",
    email: "ada@northwind.example",
    role: "tenant_admin",
    created_at: NOW,
    first_name: "Ada",
    last_name: "Lovelace",
  },
  {
    id: "m2",
    tenant_id: TENANT,
    user_id: "22222222-2222-4222-8222-222222222222",
    email: "grace@northwind.example",
    role: "service_manager",
    created_at: NOW,
    first_name: "Grace",
    last_name: "Hopper",
  },
];

const invitations: Invitation[] = [
  {
    id: "i1",
    tenant_id: TENANT,
    email: "ken@northwind.example",
    role: "editor",
    created_at: NOW,
    expires_at: "2026-11-20T15:00:00.000Z",
  },
];

const owners: ServiceOwner[] = [
  owner("o1", "Ada", "Lovelace", "ada@northwind.example", "SOC Manager", true, members[0]?.user_id ?? null, false),
  owner("o2", "Grace", "Hopper", "grace@northwind.example", "Identity Lead", true, members[1]?.user_id ?? null, false),
  owner("o3", "Ken", "Thompson", "ken@northwind.example", "Engineer", false, null, false),
];

const named = {
  ...blankService(TENANT, "s1", "SVC-014"),
  name: "Managed detection",
  summary: "Watch the fictional Northwind estate.",
  owner_id: "o1",
  service_owner: "Lovelace, Ada",
  owner_needed: false,
};
const gap = {
  ...blankService(TENANT, "s2", "SVC-015"),
  name: "Architecture advisory",
  summary: "A service whose free-text owner could not be split.",
  service_owner: "Security Architecture (to be named)",
  owner_review: "Security Architecture (to be named)",
  owner_needed: true,
  owner_gap: true,
};

const history: OwnerHistoryEntry[] = [
  {
    id: "h1",
    tenant_id: TENANT,
    service_id: "s1",
    actor_user_id: members[0]?.user_id ?? null,
    old_owner_id: "o3",
    new_owner_id: "o1",
    reason: "archive",
    note: "Reassigned when Ken Thompson was archived.",
    created_at: NOW,
  },
];

const accounts: SiteAccount[] = [
  {
    user_id: members[0]?.user_id ?? "",
    email: "ada@northwind.example",
    first_name: "Ada",
    last_name: "Lovelace",
    deactivated_at: null,
    memberships: [{ tenant_id: TENANT, name: tenant.name, role: "tenant_admin" }],
  },
  {
    user_id: "55555555-5555-4555-8555-555555555555",
    email: "sam@contoso.example",
    first_name: "Sam",
    last_name: "Rivera",
    deactivated_at: NOW,
    memberships: [{ tenant_id: TENANT, name: tenant.name, role: "viewer" }],
  },
];

function owner(
  id: string,
  first: string,
  last: string,
  email: string,
  title: string,
  active: boolean,
  userId: string | null,
  deactivated: boolean,
): ServiceOwner {
  return {
    id,
    tenant_id: TENANT,
    first_name: first,
    last_name: last,
    email,
    title,
    team_code: "sec_ops",
    is_active: active,
    user_id: userId,
    deactivated_user: deactivated,
    created_at: NOW,
    updated_at: NOW,
  };
}

function fixture(): CatalogApi {
  const asyncNoop = async () => undefined;
  return {
    ready: true,
    error: null,
    warning: null,
    clearError: () => undefined,
    session: { userId: members[0]?.user_id ?? "", email: "ada@northwind.example", firstName: "Ada", lastName: "Lovelace", company: "Northwind Security" },
    tenants: [tenant],
    activeTenant: tenant,
    role: "tenant_admin",
    canWrite: true,
    canAdmin: true,
    canCreateWorkspace: true,
    canGrantOwner: false,
    fields: materializeFields(TENANT, (key) => `field-${key}`),
    lookups: [
      {
        id: "team1",
        tenant_id: TENANT,
        field_key: "team",
        code: "sec_ops",
        label: "Security Operations",
        description: null,
        code_prefix: "SOC",
        sort_order: 1,
        is_active: true,
      },
    ],
    services: [named, gap],
    artifacts: [],
    artifactLinks: [],
    framework: null,
    frameworks: [],
    elements: [],
    mappings: [],
    exportProfiles: [],
    audit: [],
    members,
    invitations,
    owners,
    ownerHistory: history,
    ownersReady: true,
    ownerReminderDue: false,
    canEditService: () => true,
    refresh: asyncNoop,
    signIn: asyncNoop,
    signUp: async () => null,
    requestPasswordReset: asyncNoop,
    updatePassword: asyncNoop,
    saveProfile: asyncNoop,
    signOut: asyncNoop,
    switchTenant: () => undefined,
    createTenant: asyncNoop,
    setServiceCodeMode: asyncNoop,
    loadSampleServices: asyncNoop,
    saveService: async () => "s1",
    saveArtifact: async () => "a",
    deleteArtifact: asyncNoop,
    saveArtifactLink: asyncNoop,
    deleteArtifactLink: asyncNoop,
    importArtifacts: async () => ({ created: 0, updated: 0 }),
    saveLookup: asyncNoop,
    addLookup: asyncNoop,
    saveField: asyncNoop,
    setFieldLookup: asyncNoop,
    addMember: async () => "Invitation saved as Editor.",
    setTenantLogo: asyncNoop,
    renameWorkspace: asyncNoop,
    archiveService: async () => named,
    deleteService: asyncNoop,
    importLookups: async () => ({ created: 0, updated: 0 }),
    checkoutBlueprints: asyncNoop,
    saveCatalogColumns: asyncNoop,
    setFieldGroup: asyncNoop,
    saveExportProfile: asyncNoop,
    deleteExportProfile: asyncNoop,
    importFramework: asyncNoop,
    recordExport: asyncNoop,
    saveOutcomeMapping: asyncNoop,
    removeOutcomeMapping: asyncNoop,
  };
}

export function Phase2Gallery() {
  const [api] = useState(fixture);
  return (
    <CatalogFixture api={api}>
      <main className="main">
        <section id="shot-settings">
          <WorkspaceSettings />
        </section>
        <section id="shot-owners">
          <OwnersAdmin />
        </section>
        <section id="shot-catalog">
          <CatalogScreen />
        </section>
        <section id="shot-service">
          <ServiceForm serviceId="s1" />
        </section>
        <section id="shot-site">
          <CatalogFixture api={{ ...api, role: "platform_owner" }}>
            <SiteUsers previewAccounts={accounts} />
          </CatalogFixture>
        </section>
      </main>
    </CatalogFixture>
  );
}
