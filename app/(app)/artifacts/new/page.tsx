"use client";

import { Suspense } from "react";
import { ArtifactEditor } from "@/components/artifact-editor";
import { Loading } from "@/components/widgets";

export default function NewArtifactPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ArtifactEditor artifactId="new" />
    </Suspense>
  );
}
