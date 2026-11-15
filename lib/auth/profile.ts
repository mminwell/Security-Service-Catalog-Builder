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

export function headerLabel(session: { email: string; firstName?: string | null }): string {
  const first = session.firstName?.trim() ?? "";
  return first.length > 0 ? first : session.email;
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
