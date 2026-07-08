import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "QRguitar Dashboard",
  "Manage your saved QRguitar Profiles.",
  "/dashboard"
);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
