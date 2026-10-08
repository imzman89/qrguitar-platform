import type { Metadata } from "next";
import DirectBillingPage from "../DirectBillingPage";

export const metadata: Metadata = {
  title: "Legacy payment recovery | QRguitar",
  robots: { index: false, follow: false }
};

export default function Page() { return <DirectBillingPage existingOnly />; }
