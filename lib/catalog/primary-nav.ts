import { SHOP_FREE_BLUEPRINTS_LABEL } from "@/lib/catalog/shop-label";

export type PrimaryNavItem = {
  href: "/catalog" | "/coverage" | "/artifacts" | "/admin/fields" | "/admin/lookups" | "/blueprints";
  label: string;
  admin: boolean;
  cart: boolean;
};

/**
 * Order after the product name. Admin links stay in this sequence when the role can see them.
 * Artifacts sits with the other workspace views, after Coverage and before the admin tools.
 */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { href: "/catalog", label: "Catalog", admin: false, cart: false },
  { href: "/coverage", label: "Coverage", admin: false, cart: false },
  { href: "/artifacts", label: "Artifacts", admin: false, cart: false },
  { href: "/admin/fields", label: "Fields", admin: true, cart: false },
  { href: "/admin/lookups", label: "Lookups", admin: true, cart: false },
  { href: "/blueprints", label: SHOP_FREE_BLUEPRINTS_LABEL, admin: false, cart: true },
];

export function primaryNavFor(canAdmin: boolean): PrimaryNavItem[] {
  return PRIMARY_NAV.filter((item) => canAdmin || !item.admin);
}
