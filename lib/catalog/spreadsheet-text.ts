/** Prefix spreadsheet formulas so Excel and Sheets treat the cell as text. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetText(value: string): string {
  if (FORMULA_PREFIX.test(value)) return `'${value}`;
  return value;
}

export function csvEscape(value: string): string {
  const safe = neutralizeSpreadsheetText(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Excel cell text limit is 32,767 characters. */
export function clampCell(value: string): string {
  const safe = neutralizeSpreadsheetText(value);
  if (safe.length <= 32767) return safe;
  return `${safe.slice(0, 32750)} [truncated]`;
}
