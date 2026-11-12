import type { Visibility } from "@/lib/catalog/types";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export function statusTone(code: string | null | undefined): Tone {
  switch (code) {
    case "active":
      return "success";
    case "planned":
    case "pilot":
      return "info";
    case "deprecated":
      return "warning";
    case "retired":
      return "danger";
    default:
      return "neutral";
  }
}

export function capabilityTone(code: string | null | undefined): Tone {
  switch (code) {
    case "full":
      return "success";
    case "partial":
      return "warning";
    case "none":
      return "danger";
    default:
      return "neutral";
  }
}

export function cmmiTone(level: number | null | undefined): Tone {
  if (level == null) return "neutral";
  if (level >= 4) return "success";
  if (level >= 2) return "warning";
  return "danger";
}

export function completenessTone(percent: number): Tone {
  if (percent < 50) return "danger";
  if (percent < 80) return "warning";
  return "success";
}

export function visibilityLabel(visibility: Visibility): string {
  return visibility === "internal" ? "Internal" : "Public";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Local date and time for an export details page, such as "12 Nov 2026, 15:04". */
export function localTimestamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const iso = `${now.getFullYear()}-${month}-${day}`;
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hours}:${minutes}`;
}

export function reviewTone(iso: string | null | undefined): Tone {
  if (!iso) return "neutral";
  const today = localToday();
  if (iso.slice(0, 10) < today) return "danger";
  const due = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const start = new Date(`${today}T00:00:00`);
  const days = (due.getTime() - start.getTime()) / 86_400_000;
  if (days <= 30) return "warning";
  return "neutral";
}

export function gapText(gap: number | null | undefined): string {
  if (gap == null) return "—";
  if (gap === 0) return "0 · at target";
  if (gap > 0) return `${gap} · target is ahead`;
  return `${gap} · current is above target`;
}

export function shortTier(label: string): string {
  const [head] = label.split("—");
  return (head ?? label).trim();
}
