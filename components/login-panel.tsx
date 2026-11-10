"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/auth/redirect";
import { useCatalog } from "@/components/catalog-provider";
import { Loading } from "@/components/widgets";

type AuthMode = "sign-in" | "create" | "reset";

export function LoginPanel() {
  const api = useCatalog();
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = safeNextPath(search.get("next"));
  const linkError = search.get("error") === "auth";
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (api.ready && api.session) router.replace(nextPath);
  }, [api.ready, api.session, nextPath, router]);

  if (!api.ready) return <Loading label="Loading…" />;
  if (api.session) return <Loading label="Opening the catalog…" />;

  const title = mode === "create" ? "Create account" : mode === "reset" ? "Reset password" : "Sign in";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    try {
      if (mode === "reset") {
        await api.requestPasswordReset(email);
        setNotice("If an account exists for that email, a reset link is on its way.");
        return;
      }
      if (mode === "create") {
        const message = await api.signUp(email, password);
        if (message) setNotice(message);
        else router.replace(nextPath);
        return;
      }
      await api.signIn(email, password);
      router.replace(nextPath);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not sign in.");
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>{title}</h1>
        <p className="lede">
          One catalog for the security services you deliver. The first account creates a workspace and becomes its
          Admin.
        </p>
        {linkError ? (
          <p className="field-error" role="alert">
            That link expired or could not be verified. Request a new one.
          </p>
        ) : null}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {mode === "reset" ? null : (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          )}
          {localError ? (
            <p className="field-error" role="alert">
              {localError}
            </p>
          ) : null}
          {notice ? <p className="hint">{notice}</p> : null}
          <button type="submit" className="btn btn-primary">
            {mode === "create" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </button>
        </form>
        <div className="auth-links">
          {mode === "sign-in" ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => switchMode("create")}>
                Create account
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => switchMode("reset")}>
                Forgot password
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => switchMode("sign-in")}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );

  function switchMode(next: AuthMode) {
    setMode(next);
    setLocalError(null);
    setNotice(null);
  }
}
