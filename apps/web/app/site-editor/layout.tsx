import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Site Editor",
  "Authorized QRguitar site publishing workspace."
);

export default function SiteEditorLayout({ children }: { children: ReactNode }) {
  return children;
}
