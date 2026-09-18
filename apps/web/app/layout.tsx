import "./globals.css";
import "./product.css";
import "./theme.css";
import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "../components/PwaRuntime";
import type { CSSProperties, ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { SessionLifecycle } from "../components/SessionLifecycle";
import { OptionalTrackingConsent } from "../components/OptionalTrackingConsent";
import { buildOrganizationJsonLd } from "../lib/seo";
import { buildManagedSiteMetadata } from "../lib/site-metadata";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...await buildManagedSiteMetadata(),
    applicationName: "QRguitar",
    appleWebApp: { capable: true, title: "QRguitar", statusBarStyle: "default" }
  };
}

export const viewport: Viewport = { themeColor: "#0c1718" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const organizationJsonLd = buildOrganizationJsonLd();
  const publishedSettings = await loadPublishedSiteSettings();
  const themeStyle = {
    "--bg": publishedSettings.colors.background,
    "--bg-2": publishedSettings.colors.background,
    "--panel": publishedSettings.colors.panel,
    "--panel-2": publishedSettings.colors.panel,
    "--gold": publishedSettings.colors.gold,
    "--gold-2": publishedSettings.colors.gold,
    "--cream": publishedSettings.colors.cream,
    "--text": publishedSettings.colors.text,
    "--warm-canvas": `color-mix(in srgb, ${publishedSettings.colors.cream} 68%, white)`,
    "--light-surface": `color-mix(in srgb, ${publishedSettings.colors.cream} 34%, white)`,
    "--dark-text": publishedSettings.colors.background
  } as CSSProperties;

  return (
    <html lang="en" style={themeStyle}>
      <body data-product-theme="paper">
        <ThemeRuntime />
        <SessionLifecycle />
        <script
          id="qrguitar-organization-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <PwaRuntime>{children}</PwaRuntime>
        <OptionalTrackingConsent />
      </body>
    </html>
  );
}
