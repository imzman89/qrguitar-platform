import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Edit Profile",
  "Manage an authorized QRguitar Profile."
);

export default function EditLayout({ children }: { children: ReactNode }) {
  return children;
}
