import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "Browse QRguitar Profiles",
  "Browse QRguitar Profiles for instruments, amps, pedals, builders, shops, and collectors.",
  "/catalog"
);

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
