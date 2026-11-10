import type { ReactNode } from "react";
import { safeHttpUrl } from "@/lib/catalog/artifacts";

/** Renders an http(s) link. Any other value, including javascript:, is not turned into an href. */
export function ExternalUrl({ url, children }: { url: string | null | undefined; children?: ReactNode }) {
  const href = safeHttpUrl(url);
  if (!href) return <span>{children ?? "No link"}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children ?? "Open"}
    </a>
  );
}
