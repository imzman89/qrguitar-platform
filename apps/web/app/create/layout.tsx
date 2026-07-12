import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "Create a QRguitar Profile",
  "Create a permanent QRguitar Profile for your instrument, amp, pedal, or brand asset.",
  "/create"
);

export default function CreateLayout({ children }: { children: ReactNode }) {
  return children;
}
