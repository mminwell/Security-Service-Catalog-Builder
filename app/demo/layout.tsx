import type { ReactNode } from "react";
import { AppShell } from "@/components/shell";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
