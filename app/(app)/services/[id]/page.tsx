"use client";

import { useParams } from "next/navigation";
import { ServiceForm } from "@/components/service-form";

export default function EditServicePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  return <ServiceForm key={id} serviceId={id} />;
}
