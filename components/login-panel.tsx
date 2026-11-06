"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useCatalog } from "@/components/catalog-provider";
import { Loading } from "@/components/widgets";

export function LoginPanel() {
  const api = useCatalog();
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (api.ready && api.session) router.replace("/catalog");
  }, [api.ready, api.session, router]);

  if (!api.ready) return <Loading label="Loading…" />;
  if (api.session) return <Loading label="Opening the catalog…" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Use a password of at least 8 characters.");
      return;
    }
    try {
      if (mode === "create") {
        const message = await api.signUp(email.trim(), password);
        if (message) setNotice(message);
      } else {
        await api.signIn(email.trim(), password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not sign in.");
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>{mode === "create" ? "Create account" : "Sign in"}</h1>
        <p className="lede">
          One catalog for the security services you deliver. Keep internal notes internal, and export the view each
          audience should see.
        </p>
        {api.mode === "demo" ? (
          <div className="callout">
            <strong>Interactive Demo Mode.</strong> Any email and a password of at least 8 characters signs you in
            inside this browser. You will land in Acme Corp, with Meridian Health available in the workspace switcher.
            Nothing is sent to a server.
          </div>
        ) : (
          <div className="callout">
            This deployment uses your Supabase project. The first account becomes the platform owner and receives a
            seeded workspace.
          </div>
        )}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            placeholder="alex.rivera@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {localError ? <p className="field-error">{localError}</p> : null}
          {notice ? <p className="hint">{notice}</p> : null}
          <button type="submit" className="btn btn-primary">
            {mode === "create" ? "Create account" : "Sign in"}
          </button>
        </form>
        {api.mode === "supabase" ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => {
              setMode((current) => (current === "create" ? "sign-in" : "create"));
              setLocalError(null);
              setNotice(null);
            }}
          >
            {mode === "create" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
