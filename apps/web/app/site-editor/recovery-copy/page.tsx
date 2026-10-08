import type { Metadata } from "next";
import { RecoveryCopyCorrection } from "../../../components/RecoveryCopyCorrection";

export const metadata: Metadata = { title: "Recovery introduction | QRguitar", robots: { index: false, follow: false } };

export default function RecoveryCopyPage() {
  return <main><RecoveryCopyCorrection /></main>;
}
