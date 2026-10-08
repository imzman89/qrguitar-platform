import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Sign in to QRguitar",
  "Sign in to manage your QRguitar Profiles."
);

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
