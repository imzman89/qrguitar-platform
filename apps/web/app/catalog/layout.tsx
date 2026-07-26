import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("catalog", "/catalog");
}

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
