import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPageMetadata(
  "Sign in to QRguitar",
  "Sign in to manage your QRguitar records.",
  "/login"
);

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
