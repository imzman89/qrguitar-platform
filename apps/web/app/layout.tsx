import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { SessionLifecycle } from "../components/SessionLifecycle";
import { buildDefaultMetadata, buildOrganizationJsonLd } from "../lib/seo";

export const metadata: Metadata = buildDefaultMetadata();

export default function RootLayout({ children }: { children: ReactNode }) {
  const organizationJsonLd = buildOrganizationJsonLd();

  return (
    <html lang="en">
      <body>
        <ThemeRuntime />
        <SessionLifecycle />
        <script
          id="qrguitar-organization-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
