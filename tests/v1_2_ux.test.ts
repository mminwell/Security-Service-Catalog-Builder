import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALREADY_IN_CATALOG_LABEL,
  BLUEPRINT_LIST_ROW_FIELDS,
  BLUEPRINT_PAGE_SECTIONS,
  BLUEPRINT_VIEW_KEY,
  cycleBlueprintView,
  normalizeBlueprintView,
  readBlueprintView,
  SKIP_EXISTING_LABEL,
  writeBlueprintView,
} from "@/lib/catalog/blueprint-view";
import { CATALOG_SEARCH_DESKTOP, CATALOG_SEARCH_PLACEHOLDER, CATALOG_TOOLBAR_CONTROLS, catalogSearchWidth } from "@/lib/catalog/catalog-toolbar";
import { placeAnchoredPanel, placementRelativeToTrigger } from "@/lib/catalog/popup-placement";
import { SHOP_FREE_BLUEPRINTS_LABEL } from "@/lib/catalog/shop-label";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalog toolbar", () => {
  it("keeps a compact Search field and the Filter, Columns, Export order", () => {
    expect(CATALOG_SEARCH_PLACEHOLDER).toBe("Search");
    expect(CATALOG_TOOLBAR_CONTROLS).toEqual(["search", "filter", "columns", "export"]);
    expect(catalogSearchWidth(1440)).toBeGreaterThanOrEqual(CATALOG_SEARCH_DESKTOP.min);
    expect(catalogSearchWidth(1440)).toBeLessThanOrEqual(CATALOG_SEARCH_DESKTOP.max);
    expect(catalogSearchWidth(1280)).toBe(catalogSearchWidth(1440));
    expect(catalogSearchWidth(390)).toBeLessThanOrEqual(CATALOG_SEARCH_DESKTOP.max);
    expect(catalogSearchWidth(390)).toBeLessThanOrEqual(390);

    const screen = readFileSync("components/catalog-screen.tsx", "utf8");
    const search = screen.indexOf('data-control="search"');
    const filter = screen.indexOf("<FilterControl");
    const columns = screen.indexOf("<ColumnPicker");
    const exportButton = screen.indexOf('data-control="export"');
    const toolbarEnd = screen.indexOf("</div>", search);
    const chips = screen.indexOf("<FilterChipRow");
    expect(search).toBeGreaterThan(-1);
    expect(search).toBeLessThan(filter);
    expect(filter).toBeLessThan(columns);
    expect(columns).toBeLessThan(exportButton);
    expect(chips).toBeGreaterThan(toolbarEnd);
    expect(screen).toContain("CATALOG_SEARCH_PLACEHOLDER");
    expect(screen).toContain('aria-label="Search services"');
    expect(screen).not.toContain("Search code, name, or summary");
    expect(screen).toContain("service-catalog-toolbar");

    const tools = readFileSync("components/catalog-tools.tsx", "utf8");
    const chipActions = tools.indexOf('className="chip-actions"');
    const additional = tools.indexOf("+ Add additional filter");
    const clear = tools.indexOf("Clear all");
    expect(chipActions).toBeGreaterThan(-1);
    expect(chipActions).toBeLessThan(additional);
    expect(additional).toBeLessThan(clear);
    const panel = tools.slice(tools.indexOf('aria-label="Filter services"'), tools.indexOf("export function FilterChipRow"));
    expect(panel).not.toContain("Add additional filter");
    expect(panel).not.toContain("Clear all");
  });
});

describe("filter pop-up placement", () => {
  it("opens beside a left-side trigger and stays inside 1440, 1280, and narrow viewports", () => {
    const beside = placeAnchoredPanel({ top: 220, left: 360, width: 78, height: 36 }, { width: 1440, height: 900 });
    expect(beside.left).toBe(360);
    expect(beside.width).toBe(420);
    expect(beside.top).toBe(220 + 36 + 8);
    expect(placementRelativeToTrigger(beside, { top: 220, left: 360, width: 78, height: 36 }).left).toBe(0);

    const crowded = placeAnchoredPanel({ top: 220, left: 1200, width: 78, height: 36 }, { width: 1440, height: 900 });
    expect(crowded.left + crowded.width).toBeLessThanOrEqual(1440 - 12);
    expect(crowded.left).toBeGreaterThan(360);

    for (const width of [1440, 1280, 390, 320]) {
      for (const left of [16, 280, Math.max(16, width - 88)]) {
        const placement = placeAnchoredPanel({ top: 160, left, width: 78, height: 36 }, { width, height: 800 });
        expect(placement.left).toBeGreaterThanOrEqual(12);
        expect(placement.left + placement.width).toBeLessThanOrEqual(width - 12);
        expect(placement.top).toBeGreaterThanOrEqual(12);
        expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(800 - 12);
        expect(placement.width).toBeLessThanOrEqual(width - 24);
      }
    }

    const flipped = placeAnchoredPanel({ top: 760, left: 40, width: 78, height: 36 }, { width: 1280, height: 800 });
    expect(flipped.top).toBeLessThan(760);
    expect(flipped.top + flipped.maxHeight).toBeLessThanOrEqual(800 - 12);
  });
});

describe("blueprint store view", () => {
  it("defaults to list, remembers cards, and moves with the keyboard", () => {
    expect(normalizeBlueprintView(null)).toBe("list");
    expect(normalizeBlueprintView("table")).toBe("list");
    expect(normalizeBlueprintView("cards")).toBe("cards");
    expect(BLUEPRINT_PAGE_SECTIONS).toEqual(["browse", "results", "starter-packs"]);
    expect(BLUEPRINT_LIST_ROW_FIELDS).toEqual(["name", "category", "tier", "csf", "summary"]);
    expect(ALREADY_IN_CATALOG_LABEL).toBe("Already in catalog");
    expect(SKIP_EXISTING_LABEL).toBe("Skip services already in this catalog");

    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    expect(readBlueprintView()).toBe("list");
    writeBlueprintView("cards");
    expect(storage.get(BLUEPRINT_VIEW_KEY)).toBe("cards");
    expect(readBlueprintView()).toBe("cards");
    storage.set(BLUEPRINT_VIEW_KEY, "mosaic");
    expect(readBlueprintView()).toBe("list");

    expect(cycleBlueprintView("cards", "ArrowRight")).toBe("list");
    expect(cycleBlueprintView("list", "ArrowLeft")).toBe("cards");
    expect(cycleBlueprintView("list", "ArrowUp")).toBe("cards");
    expect(cycleBlueprintView("cards", "Home")).toBe("cards");
    expect(cycleBlueprintView("cards", "End")).toBe("list");
    expect(cycleBlueprintView("list", "Enter")).toBeNull();

    const source = readFileSync("components/blueprint-store.tsx", "utf8");
    const browse = source.indexOf('data-section="browse"');
    const results = source.indexOf('data-section="results"');
    const packs = source.indexOf('data-section="starter-packs"');
    expect(browse).toBeGreaterThan(-1);
    expect(browse).toBeLessThan(results);
    expect(results).toBeLessThan(packs);
    const actions = source.slice(source.indexOf("function BlueprintActions"), source.indexOf("function BlueprintCard"));
    const card = source.slice(source.indexOf("function BlueprintCard"), source.indexOf("function BlueprintListRow"));
    const listRow = source.slice(source.indexOf("function BlueprintListRow"), source.indexOf("function PackCard"));
    expect(actions).toContain("Preview");
    expect(actions).toContain("+ Add to Cart");
    expect(actions).toContain("In Cart");
    expect(card).toContain("<BlueprintActions");
    expect(card).toContain("<AlreadyInCatalog");
    expect(listRow).toContain("<BlueprintActions");
    expect(listRow).toContain("<AlreadyInCatalog");
    expect(listRow).toContain("blueprint.summary");
    expect(listRow).not.toContain("blueprint.description");
    expect(listRow).not.toContain("blueprint.in_scope");
    expect(listRow).not.toContain("blueprint.deliverables");
    expect(source).toContain('aria-label="Blueprint layout"');
    expect(source).toContain("{SKIP_EXISTING_LABEL}");
    expect(source.indexOf("data-section=\"starter-packs\"")).toBeLessThan(source.indexOf("{SKIP_EXISTING_LABEL}"));
  });
});

describe("shop free blueprints label", () => {
  it("uses the exact label and cart icon on the nav and catalog header", () => {
    expect(SHOP_FREE_BLUEPRINTS_LABEL).toBe("Shop Free Blueprints");
    for (const file of ["components/shell.tsx", "components/catalog-screen.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("SHOP_FREE_BLUEPRINTS_LABEL");
      expect(source).toContain("<CartIcon />");
      expect(source).toContain('href="/blueprints"');
      expect(source).toContain("aria-label={SHOP_FREE_BLUEPRINTS_LABEL}");
      expect(source).not.toContain("Shop Blueprints");
    }
  });
});
