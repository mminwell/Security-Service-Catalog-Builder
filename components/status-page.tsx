import Link from "next/link";
import type { ReactNode } from "react";

export function StatusPage({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  children?: ReactNode;
}) {
  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">{kicker}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        <div className="row-actions" style={{ marginTop: 20 }}>
          {children ?? (
            <Link className="btn btn-primary" href="/catalog">
              Back to the catalog
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
