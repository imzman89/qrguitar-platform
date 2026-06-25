import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";

export const metadata: Metadata = {
  title: "QRguitar",
  description: "Permanent digital identity for musical instruments."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRuntime />
        {children}
      </body>
    </html>
  );
}
