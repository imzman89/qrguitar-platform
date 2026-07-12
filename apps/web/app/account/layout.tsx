import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your QRguitar account, profile details, password access, and privacy settings."
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
