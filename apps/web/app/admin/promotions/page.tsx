import type { Metadata } from "next";
import PromoCodesPage from "./PromoCodesPage";

export const metadata: Metadata = { title: "Promo codes | QRguitar Admin", robots: { index: false, follow: false } };
export default function Page() { return <PromoCodesPage />; }
