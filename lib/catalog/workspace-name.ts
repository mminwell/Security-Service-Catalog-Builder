export const MAX_WORKSPACE_NAME_LENGTH = 80;

/** Trim a workspace name. Empty and overlong names are rejected. The slug is not derived from this. */
export function normalizeWorkspaceName(value: string): string {
  const name = value.trim();
  if (name.length === 0) throw new Error("Enter a workspace name.");
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw new Error(`Use a workspace name of at most ${MAX_WORKSPACE_NAME_LENGTH} characters.`);
  }
  return name;
}
