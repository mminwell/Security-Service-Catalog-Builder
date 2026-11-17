"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { acceptInviteAction, completeInvitedAccountAction, finishInviteAction, previewInviteAction } from "@/app/actions/workspace";
import { readableFinishInviteError } from "@/lib/auth/invites";
import { roleLabel } from "@/lib/catalog/access";
import { profileIsIncomplete } from "@/lib/auth/profile";
import { useCatalog } from "@/components/catalog-provider";
import { PasswordField } from "@/components/password-field";
import { Loading } from "@/components/widgets";

export function FinishAccount({ token }: { token: string | null }) {
  const api = useCatalog();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState<{ firstName?: string; lastName?: string; company?: string }>({});
  const started = useRef(false);

  const returnPath = token ? `/invite/${token}` : "/invite/continue";

  useEffect(() => {
    if (!api.ready || started.current) return;
    if (!api.session) {
      started.current = true;
      router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    const session = api.session;
    if (!profileIsIncomplete(session)) {
      started.current = true;
      if (!token) {
        router.replace("/catalog");
        return;
      }
      void acceptInviteAction(token).then(async (result) => {
        if (!result.ok) {
          setError(readableFinishInviteError(result.error));
          setReady(true);
          return;
        }
        await api.refresh();
        router.replace("/catalog");
      });
      return;
    }
    if (!token) {
      started.current = true;
      return;
    }
    started.current = true;
    void previewInviteAction(token).then((result) => {
      if (!result.ok) {
        setError(readableFinishInviteError(result.error));
        setReady(true);
        return;
      }
      setEmail(result.data.email);
      setRole(roleLabel(result.data.role));
      setWorkspace(result.data.workspaceName);
      setCompany(result.data.company);
      setFirstName(session.firstName ?? "");
      setLastName(session.lastName ?? "");
      setReady(true);
    });
  }, [api, returnPath, router, token]);

  const sessionDraft = Boolean(api.ready && api.session && !token && profileIsIncomplete(api.session));
  const shownEmail = sessionDraft && api.session ? api.session.email : email;
  const shownRole = sessionDraft && api.role ? roleLabel(api.role) : role;
  const shownWorkspace = sessionDraft ? (api.activeTenant?.name ?? "") : workspace;
  const shownFirst = touched.firstName ?? (sessionDraft && api.session ? (api.session.firstName ?? "") : firstName);
  const shownLast = touched.lastName ?? (sessionDraft && api.session ? (api.session.lastName ?? "") : lastName);
  const shownCompany =
    touched.company ??
    (sessionDraft ? (api.session?.company || api.activeTenant?.name || "") : company);

  if (!ready && !sessionDraft) return <Loading label="Opening your invite…" />;

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>Finish your account</h1>
        <p className="lede">
          {shownWorkspace ? `${shownWorkspace} invited ${shownEmail} as ${shownRole}.` : "This invite sets your role. You do not choose it."} Company
          can stay blank. It is filled with the workspace name when you leave it empty.
        </p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              const fields = { firstName: shownFirst, lastName: shownLast, company: shownCompany, password };
              const submit = token ? finishInviteAction({ token, ...fields }) : completeInvitedAccountAction(fields);
              void submit.then(async (result) => {
                if (!result.ok) {
                  setError(readableFinishInviteError(result.error));
                  return;
                }
                await api.refresh();
                router.replace("/catalog");
              });
            }}
          >
            <label htmlFor="finish-email">Email</label>
            <input id="finish-email" className="input" value={shownEmail} readOnly aria-readonly="true" />
            <label htmlFor="finish-first">First name</label>
            <input
              id="finish-first"
              className="input"
              required
              value={shownFirst}
              onChange={(event) => {
                const value = event.target.value;
                setFirstName(value);
                setTouched((current) => ({ ...current, firstName: value }));
              }}
            />
            <label htmlFor="finish-last">Last name</label>
            <input
              id="finish-last"
              className="input"
              required
              value={shownLast}
              onChange={(event) => {
                const value = event.target.value;
                setLastName(value);
                setTouched((current) => ({ ...current, lastName: value }));
              }}
            />
            <label htmlFor="finish-company">Company</label>
            <input
              id="finish-company"
              className="input"
              value={shownCompany}
              onChange={(event) => {
                const value = event.target.value;
                setCompany(value);
                setTouched((current) => ({ ...current, company: value }));
              }}
            />
            <PasswordField id="finish-password" label="Password" autoComplete="new-password" required value={password} onChange={setPassword} />
            <button type="submit" className="btn btn-primary">
              Join {shownWorkspace || "workspace"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
