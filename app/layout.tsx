import type { Metadata } from "next";
import { CatalogProvider } from "@/components/catalog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Service Catalog",
  description: "Build a multi-tenant security service catalog with public and internal views.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CatalogProvider>{children}</CatalogProvider>
      </body>
    </html>
  );
}
