export function NotConfigured() {
  return (
    <main className="auth">
      <section className="auth-card">
        <p className="micro">Security Service Catalog</p>
        <h1>This deployment is not configured</h1>
        <p className="lede">
          The catalog keeps each workspace in your own Supabase project. This deployment does not have that project
          connected, so there is nothing to sign in to and no sample data is stored in the browser.
        </p>
        <div className="callout">
          <p>
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> before the build,
            apply migrations <code>0001</code> through <code>0010</code>, then redeploy. Do not put the service-role
            key in the repository or in a public variable.
          </p>
        </div>
        <p className="hint">
          Preview deployments behave this way until those two variables are present at build time. The setup steps are
          in the README.
        </p>
      </section>
    </main>
  );
}
