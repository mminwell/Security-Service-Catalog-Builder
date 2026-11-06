/** Shopping-cart helpers. Persistence lives beside these pure updates. */

export function addToCart(cart: readonly string[], id: string): string[] {
  if (cart.includes(id)) return [...cart];
  return [...cart, id];
}

export function removeFromCart(cart: readonly string[], id: string): string[] {
  return cart.filter((item) => item !== id);
}

export function toggleCart(cart: readonly string[], id: string): string[] {
  return cart.includes(id) ? removeFromCart(cart, id) : addToCart(cart, id);
}

/**
 * Add a pack into the cart. Ids already in the cart are skipped.
 * `skip` drops blueprints the caller already has in the workspace catalog.
 */
export function addPackToCart(
  cart: readonly string[],
  ids: readonly string[],
  options?: { skip?: ReadonlySet<string> },
): { cart: string[]; added: string[]; skipped: string[] } {
  const next = [...cart];
  const seen = new Set(next);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    if (options?.skip?.has(id) || seen.has(id)) {
      skipped.push(id);
      continue;
    }
    seen.add(id);
    next.push(id);
    added.push(id);
  }
  return { cart: next, added, skipped };
}
