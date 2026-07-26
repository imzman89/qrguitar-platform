import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildManagedPageMetadata } from "../../lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("howItWorks", "/how-it-works");
}

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return children;
}
