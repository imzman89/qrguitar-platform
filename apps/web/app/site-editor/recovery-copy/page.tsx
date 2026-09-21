import type { Metadata } from "next";
import { Nav } from "../../../components/Nav";
import { Footer } from "../../../components/Footer";
import { RecoveryCopyCorrection } from "../../../components/RecoveryCopyCorrection";

export const metadata: Metadata = { title: "Recovery introduction | QRguitar", robots: { index: false, follow: false } };

export default function RecoveryCopyPage() {
  return <><Nav /><main><RecoveryCopyCorrection /></main><Footer /></>;
}
