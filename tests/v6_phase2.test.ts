import { describe, expect, it } from "vitest";
import { decideInvite, inviteExpiry } from "@/lib/auth/invites";
import { allows } from "@/lib/auth/permissions";
import { canAdminister, canWriteServices, roleLabel } from "@/lib/catalog/access";
import {
  ownerDisplayName,
  planOwnerImport,
  planOwnerReconciliation,
  replacementUpdates,
  serviceHasOwnerGap,
  servicesOwnedBy,
  splitPersonName,
} from "@/lib/catalog/owner-names";
import { canCreateService, canEditServiceContent } from "@/lib/catalog/service-edit";
import { parseCsv } from "@/lib/catalog/lookup-csv";

const teams = [
  { code: "sec_ops", label: "Security Operations" },
  { code: "identity", label: "Identity" },
];

describe("owner names", () => {
  it("generates Last, First and never treats that string as the stored name", () => {
    expect(ownerDisplayName("Ada", "Lovelace")).toBe("Lovelace, Ada");
    expect(splitPersonName("Lovelace, Ada")).toEqual({ ok: true, firstName: "Ada", lastName: "Lovelace" });
    expect(splitPersonName("Ada Lovelace")).toEqual({ ok: true, firstName: "Ada", lastName: "Lovelace" });
  });

  it("flags titles and notes instead of inventing a person", () => {
    expect(splitPersonName("SOC Manager").ok).toBe(false);
    expect(splitPersonName("Identity Lead").ok).toBe(false);
    expect(splitPersonName("Security Architecture (to be named)").ok).toBe(false);
    expect(splitPersonName("Security operations lead").ok).toBe(false);
    expect(splitPersonName("Mary Ann Smith").ok).toBe(false);
  });
});

describe("owner import and reconciliation", () => {
  it("splits a single full-name column and holds unsplittable rows for review", () => {
    const matrix = parseCsv("Full Name,Email\nAda Lovelace,ada@example.com\nSOC Manager,soc@example.com\n");
    const plan = planOwnerImport(matrix, teams);
    expect(plan.error).toBeNull();
    expect(plan.rows.filter((row) => row.status === "ready")).toEqual([
      expect.objectContaining({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }),
    ]);
    expect(plan.rows.filter((row) => row.status === "review").map((row) => row.sourceName)).toEqual(["SOC Manager"]);
  });

  it("uses First Name and Last Name columns when both are present", () => {
    const matrix = parseCsv("First Name,Last Name,Team\nGrace,Hopper,Security Operations\n");
    const plan = planOwnerImport(matrix, teams);
    expect(plan.rows[0]).toMatchObject({ status: "ready", firstName: "Grace", lastName: "Hopper", teamCode: "sec_ops" });
  });

  it("does not auto-archive an ambiguous name and lists people missing from an active staff file", () => {
    const owners = [
      { id: "1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isActive: true },
      { id: "2", firstName: "Grace", lastName: "Hopper", email: null, isActive: true },
      { id: "3", firstName: "Grace", lastName: "Hopper", email: "other@example.com", isActive: true },
    ];
    const plan = planOwnerReconciliation("active", owners, [
      { line: 2, email: "ada@example.com", name: "Someone Else" },
      { line: 3, email: null, name: "Grace Hopper" },
    ]);
    expect(plan.archive.map((item) => item.ownerId)).toEqual([]);
    expect(plan.keep.map((item) => item.ownerId)).toEqual(["1"]);
    expect(plan.ambiguous.map((item) => item.label)).toEqual(["Hopper, Grace"]);
  });

  it("counts services and plans a replacement or an owner-needed flag", () => {
    const services = [
      { id: "s1", ownerId: "1" },
      { id: "s2", ownerId: "1" },
      { id: "s3", ownerId: "2" },
    ];
    expect(servicesOwnedBy(services, "1")).toHaveLength(2);
    expect(replacementUpdates(services, "1", "9", "archive").every((row) => row.nextOwnerId === "9" && row.reason === "archive")).toBe(true);
    expect(replacementUpdates(services, "1", null, "reconcile").every((row) => row.ownerNeeded && row.reason === "reconcile")).toBe(true);
  });
});

describe("owner gap and service manager access", () => {
  const owners = [{ id: "1", isActive: false, deactivatedUser: false }];

  it("treats a missing, archived, or deactivated owner as a gap once the directory exists", () => {
    expect(serviceHasOwnerGap({ owner_id: null }, owners, false)).toBe(false);
    expect(serviceHasOwnerGap({ owner_id: null }, owners, true)).toBe(true);
    expect(serviceHasOwnerGap({ owner_id: "1" }, owners, true)).toBe(true);
    expect(serviceHasOwnerGap({ owner_review: "SOC Manager" }, owners, true)).toBe(true);
    expect(serviceHasOwnerGap({ owner_id: "2" }, [{ id: "2", isActive: true, deactivatedUser: false }], true)).toBe(false);
  });

  it("lets a service manager edit only a linked active owner and keeps other roles unchanged", () => {
    expect(canEditServiceContent({
      role: "service_manager",
      userId: "user",
      ownerUserId: "user",
      ownerActive: true,
      ownerDeactivated: false,
    })).toBe(true);
    expect(canEditServiceContent({
      role: "service_manager",
      userId: "user",
      ownerUserId: "other",
      ownerActive: true,
      ownerDeactivated: false,
    })).toBe(false);
    expect(canEditServiceContent({
      role: "service_manager",
      userId: "user",
      ownerUserId: "user",
      ownerActive: false,
      ownerDeactivated: false,
    })).toBe(false);
    expect(canCreateService("service_manager")).toBe(false);
    expect(canCreateService("editor")).toBe(true);
    expect(canWriteServices("service_manager")).toBe(false);
    expect(canWriteServices("editor")).toBe(true);
    expect(canAdminister("service_manager")).toBe(false);
    expect(allows("service_manager", "read")).toBe(true);
    expect(allows("service_manager", "write")).toBe(false);
    expect(roleLabel("service_manager")).toBe("Service Manager");
  });
});

describe("invites keep the admin's role", () => {
  const invite = {
    email: "sam@example.com",
    role: "service_manager" as const,
    acceptedAt: null,
    cancelledAt: null,
    expiresAt: inviteExpiry(new Date("2026-11-13T00:00:00Z")).toISOString(),
  };

  it("accepts the stored role and rejects a different email, a cancel, and an expiry", () => {
    expect(decideInvite(invite, "sam@example.com", new Date("2026-11-14T00:00:00Z"))).toEqual({
      accept: true,
      role: "service_manager",
    });
    expect(decideInvite(invite, "other@example.com", new Date("2026-11-14T00:00:00Z")).accept).toBe(false);
    expect(decideInvite({ ...invite, cancelledAt: "2026-11-13T01:00:00Z" }, "sam@example.com", new Date("2026-11-14T00:00:00Z")).accept).toBe(false);
    expect(decideInvite(invite, "sam@example.com", new Date("2026-11-21T00:00:00Z")).accept).toBe(false);
  });
});
