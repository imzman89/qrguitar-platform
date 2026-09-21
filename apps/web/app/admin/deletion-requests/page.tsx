import type { Metadata } from "next";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { AdminIntakeQueue } from "../../../lib/account-deletion/admin-ui/AdminIntakeQueue";
import { AdminWorkspaceGate } from "../../../components/AdminWorkspaceGate";
import styles from "../../../lib/account-deletion/admin-ui/admin-intake.module.css";

export const metadata: Metadata = {
  title: "Deletion review requests | QRguitar Admin",
  robots: { index: false, follow: false },
};

export default function DeletionRequestsPage() {
  return <AdminWorkspaceGate returnPath="/admin/deletion-requests"><Nav /><main className={styles.page}><div className={styles.shell}><AdminIntakeQueue /></div></main><Footer /></AdminWorkspaceGate>;
}
