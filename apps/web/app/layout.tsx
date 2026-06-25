import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { defaultSiteSettings } from "../lib/site-settings";

export const metadata: Metadata = {
  metadataBase: new URL("https://qrguitar.com"),
  title: defaultSiteSettings.seo.title,
  description: defaultSiteSettings.seo.description,
  keywords: defaultSiteSettings.seo.keywords.split(",").map((keyword) => keyword.trim()),
  openGraph: {
    title: defaultSiteSettings.seo.title,
    description: defaultSiteSettings.seo.description,
    url: "https://qrguitar.com",
    siteName: "QRguitar",
    images: [
      {
        url: defaultSiteSettings.seo.image,
        width: 1200,
        height: 630,
        alt: "QRguitar white and orange logo with QR code"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: defaultSiteSettings.seo.title,
    description: defaultSiteSettings.seo.description,
    images: [defaultSiteSettings.seo.image]
  }
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
