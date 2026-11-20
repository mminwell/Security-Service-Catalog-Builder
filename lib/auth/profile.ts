export const MAX_PERSON_NAME_LENGTH = 80;
export const MIN_COMPANY_LENGTH = 2;
export const MAX_COMPANY_LENGTH = 80;
export const PROFILE_PROMPT_DISMISS_KEY = "sscb.profilePrompt.dismissed";

const CONTROL = /[\u0000-\u001F\u007F]/;

export type AccountProfile = {
  firstName: string;
  lastName: string;
  company: string;
};

export type AccountProfileInput = {
  firstName: string;
  lastName: string;
  company: string;
};

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validatePersonName(value: string, label: "first name" | "last name"): string | null {
  const name = collapse(value);
  if (!name) return `Enter a ${label}.`;
  if (name.length > MAX_PERSON_NAME_LENGTH) {
    return `Use a ${label} of at most ${MAX_PERSON_NAME_LENGTH} characters.`;
  }
  if (CONTROL.test(name)) return `Enter a ${label} without line breaks.`;
  return null;
}

export function validateCompanyName(value: string): string | null {
  const company = collapse(value);
  if (company.length < MIN_COMPANY_LENGTH) return "Enter a company name.";
  if (company.length > MAX_COMPANY_LENGTH) {
    return `Use a company name of at most ${MAX_COMPANY_LENGTH} characters.`;
  }
  if (CONTROL.test(company)) return "Enter a company name without line breaks.";
  return null;
}

export function validateAccountProfile(input: AccountProfileInput): string | null {
  const company = collapse(input.company);
  return (
    validatePersonName(input.firstName, "first name") ??
    validatePersonName(input.lastName, "last name") ??
    (company ? validateCompanyName(input.company) : null)
  );
}

/** Create account collects a name only. Company stays optional on the profile. */
export function normalizeSignupProfile(input: { firstName: string; lastName: string }): AccountProfile {
  const error =
    validatePersonName(input.firstName, "first name") ?? validatePersonName(input.lastName, "last name");
  if (error) throw new Error(error);
  return {
    firstName: collapse(input.firstName),
    lastName: collapse(input.lastName),
    company: "",
  };
}

export function normalizeAccountProfile(input: AccountProfileInput): AccountProfile {
  const error = validateAccountProfile(input);
  if (error) throw new Error(error);
  return {
    firstName: collapse(input.firstName),
    lastName: collapse(input.lastName),
    company: collapse(input.company),
  };
}

/** Metadata stored on the auth user at signup. Authorization does not read this. */
export function signupUserMetadata(profile: AccountProfile): {
  first_name: string;
  last_name: string;
  company?: string;
} {
  const metadata: { first_name: string; last_name: string; company?: string } = {
    first_name: profile.firstName,
    last_name: profile.lastName,
  };
  if (profile.company) metadata.company = profile.company;
  return metadata;
}

export function accountProfileFromMetadata(metadata: unknown): AccountProfile | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const firstName = typeof record.first_name === "string" ? record.first_name : "";
  const lastName = typeof record.last_name === "string" ? record.last_name : "";
  const company = typeof record.company === "string" ? record.company : "";
  if (validatePersonName(firstName, "first name") || validatePersonName(lastName, "last name")) return null;
  if (collapse(company) && validateCompanyName(company)) return null;
  return {
    firstName: collapse(firstName),
    lastName: collapse(lastName),
    company: collapse(company),
  };
}

type NamedAccount = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

function presentName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** First Unicode code point, so a surrogate pair stays one character. */
function firstGlyph(value: string): string {
  return Array.from(value)[0] ?? "";
}

function upperGlyph(value: string): string {
  const glyph = firstGlyph(value);
  return glyph ? glyph.toUpperCase() : "";
}

function isLetterOrNumber(glyph: string): boolean {
  if (/^[0-9]$/.test(glyph)) return true;
  return glyph.toLowerCase() !== glyph.toUpperCase();
}

function emailInitial(email: string): string {
  const glyphs = Array.from(email).filter((glyph) => glyph.trim().length > 0);
  if (glyphs.length === 0) return "?";
  const preferred = glyphs.find(isLetterOrNumber);
  return (preferred ?? glyphs[0]).toUpperCase();
}

export function headerLabel(session: { email: string; firstName?: string | null }): string {
  const first = presentName(session.firstName);
  return first.length > 0 ? first : session.email;
}

/** First + last initials, one initial when only one name is saved, otherwise an email mark. */
export function avatarInitials(session: NamedAccount): string {
  const first = presentName(session.firstName);
  const last = presentName(session.lastName);
  if (first && last) return `${upperGlyph(first)}${upperGlyph(last)}`;
  if (first) return upperGlyph(first);
  if (last) return upperGlyph(last);
  return emailInitial(session.email);
}

/** Trimmed first and last name. Empty when neither name is saved. */
export function fullName(session: { firstName?: string | null; lastName?: string | null }): string {
  return [presentName(session.firstName), presentName(session.lastName)].filter((part) => part.length > 0).join(" ");
}

/** Tooltip and accessible name: full name, or email when no name is saved, plus the role label. */
export function accountMenuLabel(session: NamedAccount, role?: string | null): string {
  const name = fullName(session) || session.email.trim() || "?";
  const roleText = role?.trim() ?? "";
  return roleText.length > 0 ? `${name} · ${roleText}` : name;
}

export function profileIsIncomplete(session: { firstName?: string | null; lastName?: string | null }): boolean {
  return !session.firstName?.trim() || !session.lastName?.trim();
}

export function isProfilePromptDismissed(store: KeyValueStore, userId: string): boolean {
  return store.getItem(PROFILE_PROMPT_DISMISS_KEY) === userId;
}

export function dismissProfilePrompt(store: KeyValueStore, userId: string): void {
  store.setItem(PROFILE_PROMPT_DISMISS_KEY, userId);
}

export function clearProfilePromptDismissal(store: KeyValueStore): void {
  store.removeItem(PROFILE_PROMPT_DISMISS_KEY);
}

export function browserPromptStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}
