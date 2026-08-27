import "./globals.css";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { SessionLifecycle } from "../components/SessionLifecycle";
import { buildOrganizationJsonLd } from "../lib/seo";
import { buildManagedSiteMetadata } from "../lib/site-metadata";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedSiteMetadata();
}

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
