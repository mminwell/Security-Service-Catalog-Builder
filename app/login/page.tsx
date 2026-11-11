import { Suspense } from "react";
import { LoginPanel } from "@/components/login-panel";
import { Loading } from "@/components/widgets";

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      <LoginPanel />
    </Suspense>
  );
}
