import type { Metadata } from "next";
import { connection } from "next/server";
import { AppState } from "@/components/app-state";
import { HelpContentProvider } from "@/components/help-panel";
import { SaveToastProvider } from "@/components/save-toast";
import { loadHelpArticles } from "@/lib/help/load";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonces are minted per request. Waiting for the request keeps every page dynamic
  // so Next can stamp that nonce onto its scripts.
  await connection();
  const articles = loadHelpArticles();
  return (
    <html lang="en">
      <body>
        <SaveToastProvider>
          <HelpContentProvider articles={articles}>
            <AppState>{children}</AppState>
          </HelpContentProvider>
        </SaveToastProvider>
      </body>
    </html>
  );
}
