export const MAX_WORKSPACE_NAME_LENGTH = 80;

/** Used when the first name is missing or the derived name would be longer than 80 characters. */
export const PLACEHOLDER_WORKSPACE_NAME = "My workspace";

const CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * Name given to the workspace created with a new account.
 * The owner renames it later in Workspace Settings.
 */
export function placeholderWorkspaceName(firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim().replace(/\s+/g, " ");
  if (!name || CONTROL.test(name)) return PLACEHOLDER_WORKSPACE_NAME;
  const derived = `${name}'s workspace`;
  if (derived.length > MAX_WORKSPACE_NAME_LENGTH) return PLACEHOLDER_WORKSPACE_NAME;
  return derived;
}

/** Trim a workspace name. Empty and overlong names are rejected. The slug is not derived from this. */
export function normalizeWorkspaceName(value: string): string {
  const name = value.trim();
  if (name.length === 0) throw new Error("Enter a workspace name.");
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw new Error(`Use a workspace name of at most ${MAX_WORKSPACE_NAME_LENGTH} characters.`);
  }
  return name;
}
