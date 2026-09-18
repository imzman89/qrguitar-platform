import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = buildPrivatePageMetadata(
  "Reset Password",
  "Choose a new password for your QRguitar account."
);

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
