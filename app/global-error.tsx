"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="auth">
          <section className="auth-card">
            <p className="micro">Security Service Catalog</p>
            <h1>The app hit an unexpected error</h1>
            <p className="lede">Reload the page. If it keeps happening, the deployment logs have the details.</p>
            <div className="row-actions" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-primary" onClick={() => reset()}>
                Try again
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
