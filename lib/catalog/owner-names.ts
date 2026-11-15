/**
 * Service Owner names are stored as first and last. The display form is always generated.
 * The same split rules run in the app and in the Phase 2 migration.
 */

export const OWNER_ROLE_WORDS = [
  "manager",
  "lead",
  "officer",
  "engineer",
  "architect",
  "architecture",
  "administration",
  "admin",
  "security",
  "identity",
  "exposure",
  "privacy",
  "incident",
  "response",
  "endpoint",
  "access",
  "operations",
  "awareness",
  "risk",
  "governance",
  "soc",
  "director",
  "head",
  "analyst",
  "specialist",
  "coordinator",
  "owner",
  "team",
  "third-party",
  "third",
  "party",
] as const;

const ROLE_WORDS = new Set<string>(OWNER_ROLE_WORDS);

export type NameSplit =
  | { ok: true; firstName: string; lastName: string }
  | { ok: false; reason: string };

export function ownerDisplayName(firstName: string, lastName: string): string {
  return `${lastName.trim()}, ${firstName.trim()}`;
}

export function splitPersonName(raw: string): NameSplit {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return { ok: false, reason: "Name is empty." };
  if (value.length > 160) return { ok: false, reason: "Name is too long to split cleanly." };
  if (/[\d()[\]{}]/.test(value) || /to be named/i.test(value)) {
    return { ok: false, reason: "This looks like a title or a note, not a first and last name." };
  }
  if (/[\u0000-\u001f]/.test(value)) return { ok: false, reason: "Name contains characters that cannot be stored." };

  if (value.includes(",")) {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) {
      return { ok: false, reason: "A comma-separated name needs exactly a last name and a first name." };
    }
    const [lastName, firstName] = parts;
    if (!cleanPart(lastName) || !cleanPart(firstName)) {
      return { ok: false, reason: "Could not split this name cleanly." };
    }
    return { ok: true, firstName, lastName };
  }

  const words = value.split(" ");
  if (words.length !== 2 || !words.every(cleanPart)) {
    return { ok: false, reason: "Could not split this name into a first and last name." };
  }
  return { ok: true, firstName: words[0] ?? "", lastName: words[1] ?? "" };
}

function cleanPart(value: string): boolean {
  const words = value.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 3) return false;
  if (words.some((word) => ROLE_WORDS.has(word.toLowerCase()))) return false;
  return words.every((word) => /^[\p{L}][\p{L}'’.-]{0,79}$/u.test(word));
}

export type OwnerImportSource = {
  line: number;
  cells: string[];
};

export type PlannedOwnerImport = {
  line: number;
  status: "ready" | "review";
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  teamCode: string | null;
  sourceName: string;
  reason: string | null;
};

export type TeamChoice = { code: string; label: string };

const FIRST_HEADERS = ["first_name", "firstname", "first"];
const LAST_HEADERS = ["last_name", "lastname", "last"];
const NAME_HEADERS = ["name", "full_name", "fullname", "service_owner", "owner", "person"];
const EMAIL_HEADERS = ["email", "e-mail", "mail"];
const TITLE_HEADERS = ["title", "job_title", "role_title"];
const TEAM_HEADERS = ["team", "owner_team", "department"];

export function planOwnerImport(matrix: string[][], teams: TeamChoice[]): { rows: PlannedOwnerImport[]; error: string | null } {
  if (matrix.length === 0) return { rows: [], error: "The file has no rows." };
  const headers = matrix[0]?.map(normalizeHeader) ?? [];
  const firstCol = column(headers, FIRST_HEADERS);
  const lastCol = column(headers, LAST_HEADERS);
  const nameCol = column(headers, NAME_HEADERS);
  const emailCol = column(headers, EMAIL_HEADERS);
  const titleCol = column(headers, TITLE_HEADERS);
  const teamCol = column(headers, TEAM_HEADERS);
  if (firstCol == null && lastCol == null && nameCol == null) {
    return { rows: [], error: "Use First Name and Last Name columns, or one full-name column." };
  }
  if ((firstCol == null) !== (lastCol == null)) {
    return { rows: [], error: "First Name and Last Name must both be present." };
  }

  const rows: PlannedOwnerImport[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? [];
    if (cells.every((cell) => cell.trim().length === 0)) continue;
    const email = emailCol == null ? null : cleanEmail(cells[emailCol] ?? "");
    const title = titleCol == null ? null : blankToNull(cells[titleCol] ?? "");
    const teamRaw = teamCol == null ? null : blankToNull(cells[teamCol] ?? "");
    const team = teamRaw ? matchTeam(teamRaw, teams) : { code: null, error: null };
    const sourceName =
      firstCol != null && lastCol != null
        ? [cells[firstCol], cells[lastCol]].map((cell) => (cell ?? "").trim()).filter(Boolean).join(" ")
        : (cells[nameCol ?? 0] ?? "").trim();

    if (firstCol != null && lastCol != null) {
      const firstName = (cells[firstCol] ?? "").trim();
      const lastName = (cells[lastCol] ?? "").trim();
      if (!firstName || !lastName) {
        rows.push(review(index + 1, sourceName, email, title, "First name and last name are both required."));
        continue;
      }
      const split = splitPersonName(`${lastName}, ${firstName}`);
      if (!split.ok) {
        rows.push(review(index + 1, sourceName, email, title, split.reason));
        continue;
      }
      if (team.error) {
        rows.push(review(index + 1, sourceName, email, title, team.error));
        continue;
      }
      rows.push({
        line: index + 1,
        status: "ready",
        firstName: split.firstName,
        lastName: split.lastName,
        email,
        title,
        teamCode: team.code,
        sourceName,
        reason: null,
      });
      continue;
    }

    const split = splitPersonName(sourceName);
    if (!split.ok) {
      rows.push(review(index + 1, sourceName, email, title, split.reason));
      continue;
    }
    if (team.error) {
      rows.push(review(index + 1, sourceName, email, title, team.error));
      continue;
    }
    rows.push({
      line: index + 1,
      status: "ready",
      firstName: split.firstName,
      lastName: split.lastName,
      email,
      title,
      teamCode: team.code,
      sourceName,
      reason: null,
    });
  }

  if (rows.length === 0) return { rows: [], error: "The file has no owner rows." };
  return { rows, error: null };
}

function review(
  line: number,
  sourceName: string,
  email: string | null,
  title: string | null,
  reason: string,
): PlannedOwnerImport {
  return {
    line,
    status: "review",
    firstName: null,
    lastName: null,
    email,
    title,
    teamCode: null,
    sourceName,
    reason,
  };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[\s-]+/g, "_");
}

function column(headers: string[], names: string[]): number | null {
  const index = headers.findIndex((header) => names.includes(header));
  return index >= 0 ? index : null;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return null;
  return email;
}

function matchTeam(value: string, teams: TeamChoice[]): { code: string | null; error: string | null } {
  const needle = value.trim().toLowerCase();
  const found = teams.find((team) => team.code.toLowerCase() === needle || team.label.toLowerCase() === needle);
  if (!found) return { code: null, error: `Team “${value.trim()}” is not in the team lookup.` };
  return { code: found.code, error: null };
}

export type DirectoryOwner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
};

export type StaffFileRow = {
  line: number;
  email: string | null;
  name: string | null;
};

export type ReconcilePlan = {
  archive: Array<{ ownerId: string; displayName: string; via: "email" | "name" | "absent" }>;
  keep: Array<{ ownerId: string; displayName: string }>;
  ambiguous: Array<{ label: string; reason: string }>;
  fileReview: Array<{ line: number; reason: string }>;
};

/**
 * Active-staff mode lists directory owners who are not on the file.
 * Termination mode lists directory owners who are on the file.
 * Ambiguous name matches are reported and are not archived.
 */
export function planOwnerReconciliation(
  mode: "active" | "termination",
  owners: DirectoryOwner[],
  fileRows: StaffFileRow[],
): ReconcilePlan {
  const activeOwners = owners.filter((owner) => owner.isActive);
  const fileReview: ReconcilePlan["fileReview"] = [];
  const prepared = fileRows.map((row) => {
    const email = row.email?.trim().toLowerCase() || null;
    const name = row.name?.trim() || null;
    if (!email && !name) {
      fileReview.push({ line: row.line, reason: "Row has no email and no name." });
      return null;
    }
    const split = name ? splitPersonName(name) : null;
    if (name && split && !split.ok && !email) {
      fileReview.push({ line: row.line, reason: split.reason });
      return null;
    }
    if (name && split && !split.ok && email) {
      fileReview.push({ line: row.line, reason: `${split.reason} Matched only if the email hits one owner.` });
    }
    return {
      line: row.line,
      email,
      first: split && split.ok ? split.firstName.toLowerCase() : null,
      last: split && split.ok ? split.lastName.toLowerCase() : null,
    };
  });

  const usable = prepared.filter((row): row is NonNullable<typeof row> => row != null);
  const ambiguous: ReconcilePlan["ambiguous"] = [];
  const matched = new Map<string, "email" | "name">();

  for (const owner of activeOwners) {
    const emailHits = owner.email
      ? usable.filter((row) => row.email && row.email === owner.email?.toLowerCase())
      : [];
    if (emailHits.length > 0) {
      matched.set(owner.id, "email");
      continue;
    }
    const nameHits = usable.filter(
      (row) => row.first && row.last && row.first === owner.firstName.toLowerCase() && row.last === owner.lastName.toLowerCase(),
    );
    if (nameHits.length === 0) continue;
    const sameName = activeOwners.filter(
      (other) =>
        other.firstName.toLowerCase() === owner.firstName.toLowerCase() &&
        other.lastName.toLowerCase() === owner.lastName.toLowerCase(),
    );
    if (sameName.length > 1) {
      const label = ownerDisplayName(owner.firstName, owner.lastName);
      if (!ambiguous.some((item) => item.label === label)) {
        ambiguous.push({
          label,
          reason: "More than one active owner has this name, and the file row has no matching email.",
        });
      }
      continue;
    }
    matched.set(owner.id, "name");
  }

  const archive: ReconcilePlan["archive"] = [];
  const keep: ReconcilePlan["keep"] = [];
  for (const owner of activeOwners) {
    const displayName = ownerDisplayName(owner.firstName, owner.lastName);
    const via = matched.get(owner.id);
    const ambiguousName = ambiguous.some((item) => item.label === displayName);
    if (ambiguousName && !via) continue;
    if (mode === "active") {
      if (via) keep.push({ ownerId: owner.id, displayName });
      else archive.push({ ownerId: owner.id, displayName, via: "absent" });
    } else if (via) {
      archive.push({ ownerId: owner.id, displayName, via });
    } else {
      keep.push({ ownerId: owner.id, displayName });
    }
  }

  return { archive, keep, ambiguous, fileReview };
}

export type OwnedService = { id: string; ownerId: string | null };

export function serviceHasOwnerGap(
  service: { owner_id?: string | null; owner_needed?: boolean; owner_review?: string | null },
  owners: Array<{ id: string; isActive: boolean; deactivatedUser: boolean }>,
  ready: boolean,
): boolean {
  if (!ready) return false;
  if (service.owner_needed || service.owner_review) return true;
  if (!service.owner_id) return true;
  const owner = owners.find((item) => item.id === service.owner_id);
  return !owner || !owner.isActive || owner.deactivatedUser;
}

export function servicesOwnedBy(services: OwnedService[], ownerId: string): OwnedService[] {
  return services.filter((service) => service.ownerId === ownerId);
}

export type OwnerChangeReason = "archive" | "reassign" | "import" | "edit" | "reconcile";

export function replacementUpdates(
  services: OwnedService[],
  ownerId: string,
  replacementId: string | null,
  reason: Extract<OwnerChangeReason, "archive" | "reconcile">,
): Array<{ serviceId: string; previousOwnerId: string; nextOwnerId: string | null; ownerNeeded: boolean; reason: OwnerChangeReason }> {
  return servicesOwnedBy(services, ownerId).map((service) => ({
    serviceId: service.id,
    previousOwnerId: ownerId,
    nextOwnerId: replacementId,
    ownerNeeded: replacementId == null,
    reason,
  }));
}
