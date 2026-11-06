/** Months added to last_reviewed_date. `null` means no automatic next date. */
export const CADENCE_MONTHS: Record<string, number | null> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
  on_change: null,
};

/**
 * Maturity gap is target minus current on the 0–5 CMMI lens.
 * A positive gap means the target is still ahead. Null when either side is unset.
 */
export function maturityGap(
  current: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (current == null || target == null) return null;
  if (!Number.isInteger(current) || !Number.isInteger(target)) return null;
  return target - current;
}

/**
 * Add calendar months, clamping to the last day of the destination month.
 * Matches PostgreSQL `date + interval 'n months'` for end-of-month dates.
 */
export function addMonths(isoDate: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const cursor = new Date(Date.UTC(year, monthIndex + months, 1));
  const lastDay = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clamped = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(day, lastDay)),
  );
  return clamped.toISOString().slice(0, 10);
}

/** Next review date from last_reviewed_date + review_cadence. On Change and missing inputs yield null. */
export function nextReviewDate(
  lastReviewed: string | null | undefined,
  cadence: string | null | undefined,
): string | null {
  if (!lastReviewed || !cadence) return null;
  const months = CADENCE_MONTHS[cadence];
  if (months == null) return null;
  return addMonths(lastReviewed.slice(0, 10), months);
}
