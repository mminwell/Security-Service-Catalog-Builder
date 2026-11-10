import Link from "next/link";
import { StatusPage } from "@/components/status-page";

export default function NotFound() {
  return (
    <StatusPage kicker="404" title="That page is not in the catalog" lede="The address does not match a screen in this app.">
      <Link className="btn btn-primary" href="/catalog">
        Back to the catalog
      </Link>
      <Link className="btn btn-secondary" href="/login">
        Sign in
      </Link>
    </StatusPage>
  );
}
