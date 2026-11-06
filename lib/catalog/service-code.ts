import type { ServiceCodeMode } from "@/lib/catalog/types";

export function suggestServiceCode(args: {
  existingCodes: string[];
  mode: ServiceCodeMode;
  categoryPrefix: string | null | undefined;
}): string {
  if (args.mode === "category_prefix" && args.categoryPrefix?.trim()) {
    const prefix = args.categoryPrefix.trim().toUpperCase();
    const pattern = new RegExp(`^SEC-${escapeRegExp(prefix)}-(\\d+)$`, "i");
    return `SEC-${prefix}-${pad(nextNumber(args.existingCodes, pattern))}`;
  }
  return `SVC-${pad(nextNumber(args.existingCodes, /^SVC-(\d+)$/i))}`;
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name);
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function nextNumber(codes: string[], pattern: RegExp): number {
  let max = 0;
  for (const code of codes) {
    const match = code.trim().match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return max + 1;
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
