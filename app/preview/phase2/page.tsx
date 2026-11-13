import { notFound } from "next/navigation";
import { Phase2Gallery } from "@/components/phase2-gallery";

export default function Phase2PreviewPage() {
  if (process.env.PHASE2_SCREENSHOTS !== "1") notFound();
  return <Phase2Gallery />;
}
