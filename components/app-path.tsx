"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, type ComponentProps, type ReactNode } from "react";
import { withDemoPrefix } from "@/lib/demo/paths";

const AppPathContext = createContext(false);

export function AppPathProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  return <AppPathContext.Provider value={demo}>{children}</AppPathContext.Provider>;
}

export function useAppHref(): (path: string) => string {
  const demo = useContext(AppPathContext);
  return useCallback((path: string) => withDemoPrefix(path, demo), [demo]);
}

export function AppLink({ href, ...props }: ComponentProps<typeof Link>) {
  const to = useAppHref();
  if (typeof href === "string") return <Link href={to(href)} {...props} />;
  return <Link href={href} {...props} />;
}
