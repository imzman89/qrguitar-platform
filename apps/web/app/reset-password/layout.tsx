import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Choose a new password for your QRguitar account."
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
