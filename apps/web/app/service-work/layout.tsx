import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Service Work",
  "Manage an authorized QRguitar service submission."
);

export default function ServiceWorkLayout({ children }: { children: ReactNode }) {
  return children;
}
