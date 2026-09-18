import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "QRguitar Dashboard",
  "Manage your saved QRguitar Profiles."
);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
