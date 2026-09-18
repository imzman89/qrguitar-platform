import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Ownership Claim",
  "Submit and review a private QRguitar ownership claim."
);

export default function OwnershipClaimLayout({ children }: { children: ReactNode }) {
  return children;
}
