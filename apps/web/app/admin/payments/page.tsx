import type { Metadata } from "next";
import AdminPaymentsPage from "./AdminPaymentsPage";

export const metadata: Metadata = { title: "Payment review | QRguitar Admin", robots: { index: false, follow: false } };
export default function Page() { return <AdminPaymentsPage />; }
