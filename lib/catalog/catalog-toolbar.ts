/** Visible catalog search placeholder. The accessible name stays "Search services". */
export const CATALOG_SEARCH_PLACEHOLDER = "Search";

export const CATALOG_SEARCH_DESKTOP = { min: 260, max: 320, preferred: 280 } as const;

/** Search, then Filter beside it, then Columns, then Export. No flexible spacer. */
export const CATALOG_TOOLBAR_CONTROLS = ["search", "filter", "columns", "export"] as const;

/**
 * Desktop search stays inside 260–320px.
 * Narrow viewports use the full toolbar width so the field does not overflow.
 */
export function catalogSearchWidth(viewportWidth: number): number {
  if (viewportWidth < 720) return Math.max(0, Math.min(viewportWidth, CATALOG_SEARCH_DESKTOP.max));
  return CATALOG_SEARCH_DESKTOP.preferred;
}
