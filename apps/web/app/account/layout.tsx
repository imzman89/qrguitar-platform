import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Account",
  "Manage your QRguitar account, profile details, password access, and privacy settings."
);

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
