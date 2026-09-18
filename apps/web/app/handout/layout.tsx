import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "QRguitar Print Suite",
  "Prepare QRguitar labels, hangtags, and Profile handouts."
);

export default function HandoutLayout({ children }: { children: ReactNode }) {
  return children;
}
