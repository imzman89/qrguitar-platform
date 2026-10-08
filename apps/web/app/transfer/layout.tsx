import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Ownership Transfer",
  "Review and accept a private QRguitar ownership transfer."
);

export default function TransferLayout({ children }: { children: ReactNode }) {
  return children;
}
