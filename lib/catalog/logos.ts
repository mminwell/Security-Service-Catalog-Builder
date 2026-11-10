/** Built-in fictional marks and logo input checks. No external storage. */

export const MAX_LOGO_FILE_BYTES = 80 * 1024;
export const MAX_LOGO_DATA_CHARS = 130_000;

const ACME_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#141413"/><path d="M8.2 24.2 16 7.6l7.8 16.6" fill="none" stroke="#D97757" stroke-width="2.2" stroke-linejoin="round"/><path d="M11.4 18.4h9.2" stroke="#FAF9F5" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const MERIDIAN_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#3C5C4E"/><circle cx="16" cy="16" r="8.2" fill="none" stroke="#FAF9F5" stroke-width="1.5"/><path d="M16 10.8v10.4M10.8 16h10.4" stroke="#FAF9F5" stroke-width="1.7" stroke-linecap="round"/></svg>`;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_LOGOS: Record<string, string> = {
  "acme-corp": svgDataUri(ACME_MARK),
  "meridian-health": svgDataUri(MERIDIAN_MARK),
};

export function builtinLogoForSlug(slug: string): string | null {
  return DEMO_LOGOS[slug] ?? null;
}

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function normalizeLogoInput(input: string | null | undefined): string | null {
  if (input == null) return null;
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    if (/\s/.test(value) || value.length > 2000) {
      throw new Error("Paste an image URL starting with http:// or https://.");
    }
    return value;
  }
  if (!value.startsWith("data:image/")) {
    throw new Error("Paste an image URL starting with http:// or https://, or upload an image file.");
  }
  if (value.length > MAX_LOGO_DATA_CHARS) {
    throw new Error("That logo is too large. Use an image under 80 KB.");
  }
  const raster = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value);
  const svgBase64 = /^data:image\/svg\+xml;base64,[a-z0-9+/=\s]+$/i.test(value);
  const svgText = /^data:image\/svg\+xml(?:;charset=[-\w]+)?,/i.test(value);
  if (!raster && !svgBase64 && !svgText) {
    throw new Error("Use a PNG, JPEG, GIF, WebP, or SVG image.");
  }
  const payload = value.slice(value.indexOf(",") + 1);
  let decoded = payload;
  if (svgText && !svgBase64) {
    try {
      decoded = decodeURIComponent(payload);
    } catch {
      decoded = payload;
    }
  }
  if (/<script[\s>]/i.test(decoded) || /javascript:/i.test(decoded) || /\bon[a-z]+\s*=/i.test(decoded)) {
    throw new Error("That image can't be used as a logo.");
  }
  return value;
}
