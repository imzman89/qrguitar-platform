import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "Create a QRguitar Record",
  "Create a permanent QRguitar record for your instrument, amp, pedal, or brand asset.",
  "/create"
);

export default function CreateLayout({ children }: { children: ReactNode }) {
  return children;
}
