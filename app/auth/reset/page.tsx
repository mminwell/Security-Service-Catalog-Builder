"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCatalog } from "@/components/catalog-provider";
import { Loading } from "@/components/widgets";

export default function ResetPasswordPage() {
  const api = useCatalog();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!api.ready) return <Loading label="Checking the reset link…" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Those passwords do not match.");
      return;
    }
    try {
      await api.updatePassword(password);
      router.replace("/catalog");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not update the password.");
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>Choose a new password</h1>
        <p className="lede">Use at least 8 characters. You will go straight to the catalog after it is saved.</p>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {localError ? (
            <p className="field-error" role="alert">
              {localError}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary">
            Save password
          </button>
        </form>
      </section>
    </main>
  );
}
