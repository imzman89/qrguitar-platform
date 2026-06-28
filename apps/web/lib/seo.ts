import type { Metadata } from "next";
import { instrumentDisplayName, type DemoInstrument } from "./local-demo";

export const SITE_URL = "https://www.qrguitar.com";
export const DEFAULT_OG_IMAGE = "/seo/qrguitar-og-v2.png";
export const DEFAULT_DESCRIPTION =
  "Permanent QR records for guitars, amps, pedals, builders, shops, and collectors.";

export function absoluteSiteUrl(pathOrUrl: string) {
  if (!pathOrUrl) {
    return SITE_URL;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${normalized}`;
}

export function buildDefaultMetadata(): Metadata {
  const image = absoluteSiteUrl(DEFAULT_OG_IMAGE);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: "QRguitar",
      template: "%s | QRguitar"
    },
    description: DEFAULT_DESCRIPTION,
    keywords: [
      "QRguitar",
      "guitar records",
      "instrument records",
      "guitar inventory",
      "instrument ownership",
      "builder records"
    ],
    alternates: {
      canonical: SITE_URL
    },
    openGraph: {
      title: "QRguitar",
      description: DEFAULT_DESCRIPTION,
      url: SITE_URL,
      siteName: "QRguitar",
      images: [
        {
          url: image,
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
      title: "QRguitar",
      description: DEFAULT_DESCRIPTION,
      site: "@qrguitar",
      images: [image]
    },
    robots: {
      index: true,
      follow: true
    }
  };
}

export function buildPageMetadata(
  title: string,
  description: string,
  canonicalPath: string,
  overrides?: {
    ogImage?: string;
  }
): Metadata {
  const url = absoluteSiteUrl(canonicalPath);
  const image = absoluteSiteUrl(overrides?.ogImage || DEFAULT_OG_IMAGE);

  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title: `${title} | QRguitar`,
      description,
      url,
      siteName: "QRguitar",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "QRguitar white and orange logo with QR code"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      site: "@qrguitar",
      title: `${title} | QRguitar`,
      description,
      images: [image]
    }
  };
}

export function getRecordMetadataImage(instrument: DemoInstrument) {
  const hero = String(instrument.heroImageDataUrl || "").trim();
  if (hero) {
    return absoluteSiteUrl(hero);
  }

  const firstGallery = instrument.galleryImageDataUrls?.find((source) => String(source || "").trim());
  if (firstGallery) {
    return absoluteSiteUrl(firstGallery);
  }

  return absoluteSiteUrl(DEFAULT_OG_IMAGE);
}

export function getRecordMetadataDescription(instrument: DemoInstrument) {
  const lead = [
    String(instrument.brand || "").trim(),
    String(instrument.model || "").trim(),
    String(instrument.year || "").trim(),
    String(instrument.qrCode || "").trim()
  ].filter(Boolean);

  const summary = String(instrument.summary || "").trim();
  const base = lead.join(" - ");

  if (summary) {
    return base ? `${base}. ${summary}` : summary;
  }

  return base ? `${base}. Public QRguitar record.` : DEFAULT_DESCRIPTION;
}

export function buildRecordMetadata(instrument: DemoInstrument): Metadata {
  const title = instrumentDisplayName(instrument);
  const description = getRecordMetadataDescription(instrument);
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);

  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "QRguitar",
      type: "article",
      images: [
        {
          url: image,
          alt: `${title} QRguitar record photo`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "QRguitar",
        url: SITE_URL,
        logo: absoluteSiteUrl(DEFAULT_OG_IMAGE),
        description: DEFAULT_DESCRIPTION,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "support@qrguitar.com",
            url: SITE_URL
          }
        ]
      },
      {
        "@type": "WebSite",
        name: "QRguitar",
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION
      }
    ]
  };
}

export function buildRecordJsonLd(instrument: DemoInstrument) {
  const title = instrumentDisplayName(instrument);
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);
  const description = getRecordMetadataDescription(instrument);
  const additionalProperty = (instrument.customFields || [])
    .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
    .map((field) => ({
      "@type": "PropertyValue",
      name: String(field.label).trim(),
      value: String(field.value).trim()
    }));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description,
    image: [image],
    url,
    sku: instrument.qrCode,
    serialNumber: instrument.serial || undefined,
    category: instrument.instrumentType || "Instrument",
    brand: instrument.brand
      ? {
          "@type": "Brand",
          name: instrument.brand
        }
      : undefined,
    manufacturer: instrument.builder
      ? {
          "@type": "Organization",
          name: instrument.builder
        }
      : undefined,
    additionalProperty,
    productionDate: instrument.year || undefined
  };
}
