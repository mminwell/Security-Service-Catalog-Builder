"use client";

import { useParams } from "next/navigation";
import { FinishAccount } from "@/components/finish-account";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  return <FinishAccount token={params.token} />;
}
