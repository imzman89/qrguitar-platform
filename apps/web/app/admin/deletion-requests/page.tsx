import type { Metadata } from "next";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { AdminIntakeQueue } from "../../../lib/account-deletion/admin-ui/AdminIntakeQueue";

export const metadata: Metadata = {
  title: "Deletion review requests | QRguitar Admin",
  robots: { index: false, follow: false },
};

export default function DeletionRequestsPage() {
  return <><Nav /><main className="section"><div className="shell"><AdminIntakeQueue /></div></main><Footer /></>;
}
