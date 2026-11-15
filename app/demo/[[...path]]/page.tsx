"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { FieldAdmin } from "@/components/field-admin";
import { ArtifactEditor } from "@/components/artifact-editor";
import { ArtifactsScreen } from "@/components/artifacts-screen";
import { BlueprintStore } from "@/components/blueprint-store";
import { CatalogScreen } from "@/components/catalog-screen";
import { CoverageScreen } from "@/components/coverage-screen";
import { LookupAdmin } from "@/components/lookup-admin";
import { OwnersAdmin } from "@/components/owners-admin";
import { ServiceForm } from "@/components/service-form";
import { SiteUsers } from "@/components/site-users";
import { WorkspaceSettings } from "@/components/workspace-settings";
import { AppLink } from "@/components/app-path";
import { Loading } from "@/components/widgets";

export default function DemoPage() {
  const params = useParams<{ path?: string[] }>();
  const parts = Array.isArray(params.path) ? params.path : [];
  const [head, second] = parts;

  if (!head || head === "catalog") return <CatalogScreen />;
  if (head === "services" && second === "new") return <ServiceForm key="new" serviceId="new" />;
  if (head === "services" && second) return <ServiceForm key={second} serviceId={second} />;
  if (head === "artifacts" && !second) return <ArtifactsScreen />;
  if (head === "artifacts" && second === "new") {
    return (
      <Suspense fallback={<Loading />}>
        <ArtifactEditor artifactId="new" />
      </Suspense>
    );
  }
  if (head === "artifacts" && second) {
    return (
      <Suspense fallback={<Loading />}>
        <ArtifactEditor key={second} artifactId={second} />
      </Suspense>
    );
  }
  if (head === "coverage") return <CoverageScreen />;
  if (head === "templates" || head === "blueprints") return <BlueprintStore />;
  if (head === "admin" && second === "fields") return <FieldAdmin />;
  if (head === "admin" && second === "lookups") return <LookupAdmin />;
  if (head === "admin" && second === "owners") return <OwnersAdmin />;
  if (head === "admin" && second === "users") return <SiteUsers />;
  if (head === "settings") return <WorkspaceSettings />;

  return (
    <section className="empty">
      <h2>That demo page is not in the catalog.</h2>
      <p className="lede">The sample workspace is still here. Nothing was saved.</p>
      <AppLink className="btn btn-primary" href="/catalog">
        Back to the catalog
      </AppLink>
    </section>
  );
}
