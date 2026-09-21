import type { Metadata } from "next";
import AdminPaymentsPage from "./AdminPaymentsPage";
import { AdminWorkspaceGate } from "../../../components/AdminWorkspaceGate";

export const metadata: Metadata = { title: "Payment review | QRguitar Admin", robots: { index: false, follow: false } };
export default function Page() { return <AdminWorkspaceGate returnPath="/admin/payments"><AdminPaymentsPage /></AdminWorkspaceGate>; }
