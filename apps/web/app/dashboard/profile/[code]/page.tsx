import type { Metadata } from "next";
import { OwnerProfileClient } from "./OwnerProfileClient";
export const metadata: Metadata = { title: "Your Profile | QRguitar", robots: { index: false, follow: false } };
export default async function OwnerProfilePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <OwnerProfileClient code={code} />;
}
