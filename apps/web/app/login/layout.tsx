import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { buildPrivatePageMetadata } from "../../lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const mode = (await headers()).get("x-qrguitar-auth-mode");
  const title = mode === "register" ? "Create your QRguitar account"
    : mode === "reset" ? "Reset your QRguitar password"
      : "Sign in to QRguitar";
  const description = mode === "register" ? "Create your free QRguitar account and choose your workspace."
    : mode === "reset" ? "Reset the password for your QRguitar account."
      : "Sign in to manage your QRguitar Profiles.";
  return buildPrivatePageMetadata(title, description);
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
