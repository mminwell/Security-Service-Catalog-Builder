import type { Metadata } from "next";
import { CatalogProvider } from "@/components/catalog-provider";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Security Service Catalog",
    template: "%s · Security Service Catalog",
  },
  description: "A multi-tenant catalog of the security services an organization delivers, with public and internal exports.",
  applicationName: "Security Service Catalog",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {isSupabaseConfigured() ? <CatalogProvider>{children}</CatalogProvider> : <NotConfigured />}
      </body>
    </html>
  );
}
