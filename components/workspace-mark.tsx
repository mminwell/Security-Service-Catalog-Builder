"use client";

import { useState } from "react";
import { monogram } from "@/lib/catalog/logos";

export function WorkspaceMark({
  name,
  logoUrl,
  size = 28,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = Boolean(logoUrl) && failedUrl === logoUrl;

  if (logoUrl && !failed) {
    return (
      // Practitioner logos are data URLs or arbitrary image URLs, which next/image cannot host.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="workspace-mark"
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setFailedUrl(logoUrl)}
      />
    );
  }

  return (
    <span
      className="workspace-mark monogram"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {monogram(name)}
    </span>
  );
}
