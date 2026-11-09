"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ArtifactEditor } from "@/components/artifact-editor";
import { Loading } from "@/components/widgets";

export default function ArtifactPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Loading />}>
      <ArtifactEditor key={params.id} artifactId={params.id} />
    </Suspense>
  );
}
