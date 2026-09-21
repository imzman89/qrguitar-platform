import "./styles.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PwaRuntime } from "../components/PwaRuntime";
import type { CSSProperties, ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { SessionLifecycle } from "../components/SessionLifecycle";
import { OptionalTrackingConsent } from "../components/OptionalTrackingConsent";
import { GoogleAnalyticsRuntime } from "../components/GoogleAnalyticsRuntime";
import { buildOrganizationJsonLd } from "../lib/seo";
import { buildManagedSiteMetadata } from "../lib/site-metadata";
import { loadSiteSettingsRequest } from "../lib/site-settings-server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...await buildManagedSiteMetadata(),
    applicationName: "QRguitar",
    appleWebApp: { capable: true, title: "QRguitar", statusBarStyle: "default" }
  };
}

export const viewport: Viewport = { themeColor: "#0B0D0F" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const organizationJsonLd = buildOrganizationJsonLd();
  const loadedSettings = await loadSiteSettingsRequest();
  const publishedSettings = loadedSettings.settings;
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
        {loadedSettings.source === "draft" ? (
          <div className="site-draft-preview-banner" role="status" aria-label="Draft preview is active">
            <strong>Draft preview</strong>
            <span>You are viewing unpublished Site Editor changes.</span>
            <Link href="/site-editor" target="_top">Return to Site Editor</Link>
          </div>
        ) : null}
        <ThemeRuntime />
        <SessionLifecycle />
        <GoogleAnalyticsRuntime />
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
