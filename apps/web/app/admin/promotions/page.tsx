import type { Metadata } from "next";
import PromoCodesPage from "./PromoCodesPage";
import { AdminWorkspaceGate } from "../../../components/AdminWorkspaceGate";

export const metadata: Metadata = { title: "Promo codes | QRguitar Admin", robots: { index: false, follow: false } };
export default function Page() { return <AdminWorkspaceGate returnPath="/admin/promotions"><PromoCodesPage /></AdminWorkspaceGate>; }
