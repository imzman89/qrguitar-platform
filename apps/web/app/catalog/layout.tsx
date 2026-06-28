import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "Browse Public Records",
  "Browse public QRguitar records for instruments, amps, pedals, builders, shops, and collectors.",
  "/catalog"
);

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
