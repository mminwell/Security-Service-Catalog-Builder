import { TEMPLATES_LABEL } from "@/lib/catalog/shop-label";

export type PrimaryNavItem = {
  href: "/catalog" | "/coverage" | "/artifacts" | "/admin/fields" | "/admin/lookups" | "/templates";
  label: string;
  admin: boolean;
  cart: boolean;
};

/**
 * Order after the product name, on desktop, on a narrow screen, and wherever this list is rendered.
 * Admin links stay in this sequence when the role can see them.
 * Templates is last. /blueprints still opens the same page.
 */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { href: "/catalog", label: "Catalog", admin: false, cart: false },
  { href: "/admin/fields", label: "Fields", admin: true, cart: false },
  { href: "/admin/lookups", label: "Lookups", admin: true, cart: false },
  { href: "/artifacts", label: "Artifacts", admin: false, cart: false },
  { href: "/coverage", label: "CSF Mapping", admin: false, cart: false },
  { href: "/templates", label: TEMPLATES_LABEL, admin: false, cart: true },
];

export function primaryNavFor(canAdmin: boolean): PrimaryNavItem[] {
  return PRIMARY_NAV.filter((item) => canAdmin || !item.admin);
}

export function primaryNavCurrent(pathname: string, href: string): boolean {
  if (href === "/templates") return pathname.startsWith("/templates") || pathname.startsWith("/blueprints");
  return pathname.startsWith(href);
}
