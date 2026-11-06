"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCatalog } from "@/components/catalog-provider";
import { Loading } from "@/components/widgets";

export default function HomePage() {
  const api = useCatalog();
  const router = useRouter();
  useEffect(() => {
    if (!api.ready) return;
    router.replace(api.session ? "/catalog" : "/login");
  }, [api.ready, api.session, router]);
  return <Loading />;
}
