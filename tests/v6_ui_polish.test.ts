import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  builtinDistributionWording,
  distributionWordingForEditor,
  distributionWordingToStore,
} from "@/lib/catalog/csv";
import { SERVICE_ID_STYLES } from "@/lib/catalog/service-code";
import {
  ARCHIVE_SERVICE_CONFIRMATION,
  DELETE_SERVICE_CONFIRMATION,
  serviceSaveButtonLabel,
} from "@/lib/catalog/service-edit";
import { SUCCESS_TOAST_MS, toastAutoDismissMs } from "@/components/save-toast";

describe("save confirmation timing", () => {
  it("keeps a success message up for about five seconds and leaves an error until dismissed", () => {
    expect(SUCCESS_TOAST_MS).toBe(5000);
    expect(toastAutoDismissMs("success")).toBe(5000);
    expect(toastAutoDismissMs("error")).toBeNull();
    const source = readFileSync("components/save-toast.tsx", "utf8");
    expect(source).toContain("toastAutoDismissMs(toast.tone)");
    expect(source).not.toContain("setTimeout(() => dismiss(), 2000)");
  });
});

describe("service record actions", () => {
  it("labels a new service Save Service and an existing service Save", () => {
    expect(serviceSaveButtonLabel(true, false)).toBe("Save Service");
    expect(serviceSaveButtonLabel(false, false)).toBe("Save");
    expect(serviceSaveButtonLabel(true, true)).toBe("Saving…");
    expect(serviceSaveButtonLabel(false, true)).toBe("Saving…");
  });

  it("confirms archive and permanent delete in the in-app dialog", () => {
    expect(ARCHIVE_SERVICE_CONFIRMATION).toBe("Are you sure you want to archive this service?");
    expect(DELETE_SERVICE_CONFIRMATION).toBe("Are you sure you want to delete this service? This can't be undone.");
    const source = readFileSync("components/service-form.tsx", "utf8");
    expect(source).toContain("ARCHIVE_SERVICE_CONFIRMATION");
    expect(source).toContain("DELETE_SERVICE_CONFIRMATION");
    expect(source).toContain('tone="danger"');
    expect(source).toContain("serviceSaveButtonLabel(isNew, saving)");
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("<ConfirmDialog");
  });
});

describe("workspace settings copy", () => {
  it("shows the built-in distribution lines and stores an unchanged default as blank", () => {
    const company = "Acme Corp";
    const publicLine = builtinDistributionWording(company, "public");
    const internalLine = builtinDistributionWording(company, "internal");
    expect(publicLine).toBe("ACME CORP \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(internalLine).toBe("ACME CORP \u2014 DO NOT DISTRIBUTE EXTERNALLY");
    expect(distributionWordingForEditor(company, "public", null)).toBe(publicLine);
    expect(distributionWordingForEditor(company, "public", "  ")).toBe(publicLine);
    expect(distributionWordingForEditor(company, "internal", "FICTIONAL ONLY")).toBe("FICTIONAL ONLY");
    expect(distributionWordingToStore(company, "public", publicLine)).toBe("");
    expect(distributionWordingToStore(company, "public", `  ${publicLine}  `)).toBe("");
    expect(distributionWordingToStore(company, "internal", "")).toBe("");
    expect(distributionWordingToStore(company, "public", "Custom public line")).toBe("Custom public line");
  });

  it("names the company field, pairs the ID styles, and keeps the owner reminder on General", () => {
    expect(SERVICE_ID_STYLES.map((item) => item.label)).toEqual(["SVC-001", "SEC-SOC-001"]);
    expect(new Set(SERVICE_ID_STYLES.map((item) => item.description)).size).toBe(2);
    const settings = readFileSync("components/workspace-settings.tsx", "utf8");
    const help = readFileSync("content/help/workspace.md", "utf8");
    expect(settings).toContain(">Company</label>");
    expect(settings).not.toContain("Workspace name");
    expect(settings).not.toContain("<h2>Owner reminders</h2>");
    expect(settings).toContain("Remind Admins about once a month to reconcile owners");
    expect(settings).not.toContain("Blank uses the built-in wording.");
    expect(settings).toContain("distributionWordingForEditor");
    expect(settings).toContain("id-style-copy");
    expect(settings).toContain("<h2>Export defaults</h2>");
    expect(help).toContain("company name");
    expect(help).not.toMatch(/workspace name/i);
  });
});
