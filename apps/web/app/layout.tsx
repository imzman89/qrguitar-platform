import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { buildDefaultMetadata, buildOrganizationJsonLd } from "../lib/seo";

const QRGuitarBotPopup = dynamic(() =>
  import("../components/QRGuitarBotPopup").then((mod) => mod.QRGuitarBotPopup),
  { ssr: false }
);

export const metadata: Metadata = buildDefaultMetadata();

export default function RootLayout({ children }: { children: ReactNode }) {
  const organizationJsonLd = buildOrganizationJsonLd();

  return (
    <html lang="en">
      <body>
        <ThemeRuntime />
        <script
          id="qrguitar-organization-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        <QRGuitarBotPopup />
      </body>
    </html>
  );
}
