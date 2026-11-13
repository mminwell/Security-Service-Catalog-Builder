"use client";

import { useState, type FormEvent } from "react";
import { normalizeAccountProfile, type AccountProfile, type AccountProfileInput } from "@/lib/auth/profile";

export function ProfileForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
}: {
  idPrefix: string;
  initial: AccountProfileInput;
  submitLabel: string;
  onSubmit: (profile: AccountProfile) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [company, setCompany] = useState(initial.company);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let profile: AccountProfile;
    try {
      profile = normalizeAccountProfile({ firstName, lastName, company });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter your name and company.");
      return;
    }
    setPending(true);
    try {
      await onSubmit(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label htmlFor={`${idPrefix}-first-name`}>First name</label>
      <input
        id={`${idPrefix}-first-name`}
        className="input"
        name="firstName"
        autoComplete="given-name"
        required
        maxLength={80}
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
      />
      <label htmlFor={`${idPrefix}-last-name`}>Last name</label>
      <input
        id={`${idPrefix}-last-name`}
        className="input"
        name="lastName"
        autoComplete="family-name"
        required
        maxLength={80}
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
      />
      <label htmlFor={`${idPrefix}-company`}>Company</label>
      <input
        id={`${idPrefix}-company`}
        className="input"
        name="company"
        autoComplete="organization"
        required
        maxLength={80}
        value={company}
        onChange={(event) => setCompany(event.target.value)}
      />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
