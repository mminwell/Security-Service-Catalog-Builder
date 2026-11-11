"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/status-page";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      kicker="Something went wrong"
      title="The catalog could not open this screen"
      lede="The error was recorded. You can try the screen again."
    >
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Try again
      </button>
    </StatusPage>
  );
}
