export type PasswordFieldState = {
  type: "password" | "text";
  label: "Show password" | "Hide password";
  pressed: boolean;
};

/** Hidden until the eye control is pressed. The control is a button, so it does not submit the form. */
export function passwordFieldState(visible: boolean): PasswordFieldState {
  if (visible) return { type: "text", label: "Hide password", pressed: true };
  return { type: "password", label: "Show password", pressed: false };
}
