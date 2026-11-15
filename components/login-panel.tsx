"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DEACTIVATED_MESSAGE } from "@/lib/auth/account-status";
import { authCallbackRequestBody } from "@/lib/auth/callback-link";
import { MAGIC_LINK_NOTICE } from "@/lib/auth/magic-link";
import { safeNextPath } from "@/lib/auth/redirect";
import { useCatalog } from "@/components/catalog-provider";
import { PasswordField } from "@/components/password-field";
import { Loading } from "@/components/widgets";

type AuthMode = "sign-in" | "create" | "reset";

export function LoginPanel() {
  const api = useCatalog();
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = safeNextPath(search.get("next"));
  const linkError = search.get("error");
  const linkMessage =
    linkError === "auth"
      ? "That link expired or could not be verified. Request a new one."
      : linkError === "deactivated"
        ? DEACTIVATED_MESSAGE
        : null;
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [openingLink, setOpeningLink] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const payload = authCallbackRequestBody({
      hash,
      next: search.get("next"),
      queryError: search.get("error"),
    });
    if (!payload.accessToken || !payload.refreshToken) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setOpeningLink(true);
    });
    void fetch("/auth/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then((data: { path?: unknown }) => {
        const path = typeof data.path === "string" ? data.path : "";
        window.location.replace(path.startsWith("/") && !path.startsWith("//") ? path : "/login?error=auth");
      })
      .catch(() => {
        if (cancelled) return;
        setOpeningLink(false);
        setLocalError("That link expired or could not be verified. Request a new one.");
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  useEffect(() => {
    if (openingLink) return;
    if (api.ready && api.session) router.replace(nextPath);
  }, [api.ready, api.session, nextPath, openingLink, router]);

  if (!api.ready || openingLink) return <Loading label={openingLink ? "Opening your invite…" : "Loading…"} />;
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
        const message = await api.signUp({ firstName, lastName, email, password });
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
          {mode === "create"
            ? "The first account creates a workspace and becomes its Admin. The workspace starts with a placeholder name you can rename in Workspace Settings."
            : "One catalog for the security services you deliver. The first account creates a workspace and becomes its Admin."}
        </p>
        {linkMessage ? (
          <p className="field-error" role="alert">
            {linkMessage}
          </p>
        ) : null}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          {mode === "create" ? (
            <>
              <label htmlFor="first-name">First name</label>
              <input
                id="first-name"
                className="input"
                name="firstName"
                autoComplete="given-name"
                required
                maxLength={80}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
              <label htmlFor="last-name">Last name</label>
              <input
                id="last-name"
                className="input"
                name="lastName"
                autoComplete="family-name"
                required
                maxLength={80}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </>
          ) : null}
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
            <PasswordField
              id="password"
              label="Password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              required
              value={password}
              onChange={setPassword}
            />
          )}
          {localError ? (
            <p className="field-error" role="alert">
              {localError}
            </p>
          ) : null}
          {notice ? (
            <p className="hint" role="status">
              {notice}
            </p>
          ) : null}
          {mode === "sign-in" ? (
            <div className="auth-actions">
              <button type="submit" className="btn btn-primary">
                Sign in
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void sendMagicLink()}>
                Email me a sign-in link
              </button>
            </div>
          ) : (
            <button type="submit" className="btn btn-primary">
              {mode === "create" ? "Create account" : "Send reset link"}
            </button>
          )}
          {mode === "sign-in" ? (
            <p className="hint">The link works once and then expires. Password sign-in stays available.</p>
          ) : null}
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
              <Link className="btn btn-ghost" href="/demo">
                Try the demo
              </Link>
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

  async function sendMagicLink() {
    setLocalError(null);
    setNotice(null);
    try {
      await api.requestMagicLink(email);
      setNotice(MAGIC_LINK_NOTICE);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "The sign-in link could not be sent.");
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setLocalError(null);
    setNotice(null);
  }
}
