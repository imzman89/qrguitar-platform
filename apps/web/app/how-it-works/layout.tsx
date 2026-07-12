import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Learn how QRguitar Profiles, permanent identities, serial privacy, QR scanning, ownership transfers, and shop workflows work."
};

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return children;
}
