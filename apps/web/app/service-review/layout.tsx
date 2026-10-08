import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Service Review",
  "Review a private QRguitar service submission."
);

export default function ServiceReviewLayout({ children }: { children: ReactNode }) {
  return children;
}
