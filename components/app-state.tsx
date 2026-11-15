"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppPathProvider } from "@/components/app-path";
import { CatalogProvider } from "@/components/catalog-provider";
import { DemoCatalogProvider } from "@/components/demo-catalog";
import { NotConfigured } from "@/components/not-configured";
import { isDemoPath } from "@/lib/demo/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function AppState({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demo = isDemoPath(pathname);
  return (
    <AppPathProvider demo={demo}>
      {demo ? (
        <DemoCatalogProvider>{children}</DemoCatalogProvider>
      ) : isSupabaseConfigured() ? (
        <CatalogProvider>{children}</CatalogProvider>
      ) : (
        <NotConfigured />
      )}
    </AppPathProvider>
  );
}
