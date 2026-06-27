import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ThemeRuntime } from "../components/ThemeRuntime";
import { defaultSiteSettings } from "../lib/site-settings";

const QRGuitarBotPopup = dynamic(() =>
  import("../components/QRGuitarBotPopup").then((mod) => mod.QRGuitarBotPopup),
  { ssr: false }
);

export const metadata: Metadata = {
  metadataBase: new URL("https://www.qrguitar.com"),
  title: defaultSiteSettings.seo.title,
  description: defaultSiteSettings.seo.description,
  keywords: defaultSiteSettings.seo.keywords.split(",").map((keyword) => keyword.trim()),
  alternates: {
    canonical: defaultSiteSettings.seo.canonicalUrl
  },
  openGraph: {
    title: defaultSiteSettings.seo.title,
    description: defaultSiteSettings.seo.description,
    url: "https://www.qrguitar.com",
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
    site: defaultSiteSettings.seo.twitterHandle,
    images: [defaultSiteSettings.seo.image]
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRuntime />
        {children}
        <QRGuitarBotPopup />
      </body>
    </html>
  );
}
