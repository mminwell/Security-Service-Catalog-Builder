"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { finishInviteAction, previewInviteAction } from "@/app/actions/workspace";
import { roleLabel } from "@/lib/catalog/access";
import { useCatalog } from "@/components/catalog-provider";
import { PasswordField } from "@/components/password-field";
import { Loading } from "@/components/widgets";

export function FinishAccount({ token }: { token: string }) {
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

  useEffect(() => {
    if (!api.ready) return;
    if (!api.session) {
      router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    void previewInviteAction(token).then((result) => {
      if (!result.ok) {
        setError(result.error);
        setReady(true);
        return;
      }
      setEmail(result.data.email);
      setRole(roleLabel(result.data.role));
      setWorkspace(result.data.workspaceName);
      setCompany(result.data.company);
      setFirstName(api.session?.firstName ?? "");
      setLastName(api.session?.lastName ?? "");
      setReady(true);
    });
  }, [api.ready, api.session, api.session?.firstName, api.session?.lastName, router, token]);

  if (!ready) return <Loading label="Opening your invite…" />;

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>Finish your account</h1>
        <p className="lede">
          {workspace ? `${workspace} invited ${email} as ${role}.` : "This invite sets your role. You do not choose it."} Company
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
              void finishInviteAction({ token, firstName, lastName, company, password }).then(async (result) => {
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                await api.refresh();
                router.replace("/catalog");
              });
            }}
          >
            <label htmlFor="finish-email">Email</label>
            <input id="finish-email" className="input" value={email} readOnly />
            <label htmlFor="finish-first">First name</label>
            <input id="finish-first" className="input" required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            <label htmlFor="finish-last">Last name</label>
            <input id="finish-last" className="input" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
            <label htmlFor="finish-company">Company</label>
            <input id="finish-company" className="input" value={company} onChange={(event) => setCompany(event.target.value)} />
            <PasswordField id="finish-password" label="Password" autoComplete="new-password" required value={password} onChange={setPassword} />
            <button type="submit" className="btn btn-primary">
              Join {workspace || "workspace"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
