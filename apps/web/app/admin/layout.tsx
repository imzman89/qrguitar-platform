import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "QRguitar Administration",
  "Authorized QRguitar administration workspace."
);

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
