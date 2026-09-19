import type { Metadata } from "next";
import { instrumentDisplayName, type DemoInstrument } from "./local-demo";
import type { DirectoryCollection } from "./collection-directory";
import type { PublicCollectionSettings } from "./public-collections";

export const SITE_URL = "https://www.qrguitar.com";
export const DEFAULT_OG_IMAGE = "/seo/qrguitar-og-v2.png";
export const DEFAULT_DESCRIPTION =
  "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, and collectors.";
export const SEARCH_TITLE_MAX_LENGTH = 70;
export const SEARCH_DESCRIPTION_MAX_LENGTH = 180;
export const SOCIAL_TITLE_MAX_LENGTH = 90;
export const SOCIAL_DESCRIPTION_MAX_LENGTH = 220;

export function normalizeMetadataText(value: unknown) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function isMetadataGraphemeExtender(character: string) {
  const codePoint = character.codePointAt(0) || 0;
  return /\p{Mark}/u.test(character)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f);
}

function isRegionalIndicator(character: string) {
  const codePoint = character.codePointAt(0) || 0;
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

export function fallbackMetadataGraphemes(value: string) {
  const characters = Array.from(value);
  const graphemes: string[] = [];

  for (let index = 0; index < characters.length;) {
    let grapheme = characters[index++];

    if (grapheme === "\r" && characters[index] === "\n") {
      grapheme += characters[index++];
    } else if (isRegionalIndicator(grapheme) && isRegionalIndicator(characters[index] || "")) {
      grapheme += characters[index++];
    }

    while (index < characters.length && isMetadataGraphemeExtender(characters[index])) {
      grapheme += characters[index++];
    }

    while (characters[index] === "\u200d" && index + 1 < characters.length) {
      grapheme += characters[index++];
      grapheme += characters[index++];
      while (index < characters.length && isMetadataGraphemeExtender(characters[index])) {
        grapheme += characters[index++];
      }
    }

    graphemes.push(grapheme);
  }

  return graphemes;
}

export function metadataGraphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part) => part.segment
    );
  }

  return fallbackMetadataGraphemes(value);
}

/** Keep metadata concise without splitting a Unicode grapheme or, when possible, a word. */
export function metadataExcerpt(value: unknown, maxLength: number) {
  const normalized = normalizeMetadataText(value);
  const limit = Math.max(1, Math.floor(maxLength));
  const characters = metadataGraphemes(normalized);
  if (characters.length <= limit) return normalized;
  if (limit === 1) return "…";

  const prefix = characters.slice(0, limit - 1).join("");
  const lastSpace = prefix.lastIndexOf(" ");
  const wordSafePrefix = lastSpace >= Math.floor((limit - 1) * 0.55)
    ? prefix.slice(0, lastSpace)
    : prefix;
  const cleanPrefix = wordSafePrefix.replace(/[\s,.;:!?–—-]+$/u, "") || prefix;
  return `${cleanPrefix}…`;
}

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
      "guitar profiles",
      "instrument profiles",
      "guitar inventory",
      "instrument ownership",
      "builder profiles"
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
  const searchTitle = metadataExcerpt(title, SEARCH_TITLE_MAX_LENGTH);
  const searchDescription = metadataExcerpt(description, SEARCH_DESCRIPTION_MAX_LENGTH);
  const socialTitle = metadataExcerpt(`${normalizeMetadataText(title)} | QRguitar`, SOCIAL_TITLE_MAX_LENGTH);
  const socialDescription = metadataExcerpt(description, SOCIAL_DESCRIPTION_MAX_LENGTH);

  return {
    title: searchTitle,
    description: searchDescription,
    alternates: {
      canonical: url
    },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
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
      title: socialTitle,
      description: socialDescription,
      images: [image]
    }
  };
}

export function buildPrivatePageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: null,
    openGraph: null,
    twitter: null,
    robots: {
      index: false,
      follow: false
    }
  };
}

function breadcrumbList(items: Array<{ name: string; url: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

function publicCollectionUrl(handle: string) {
  return absoluteSiteUrl(`/collections/${encodeURIComponent(handle)}`);
}

export function buildCollectionsDirectoryJsonLd(collections: DirectoryCollection[]) {
  const url = absoluteSiteUrl("/collections");
  const description = "Explore public instrument collections from QRguitar players, collectors, shops, builders, and service professionals.";
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    url,
    name: "QRguitar Member Collections",
    description,
    isPartOf: { "@type": "WebSite", name: "QRguitar", url: SITE_URL },
    breadcrumb: breadcrumbList([
      { name: "QRguitar", url: SITE_URL },
      { name: "Member Collections", url }
    ]),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: collections.length,
      itemListElement: collections.map((collection, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: collection.name,
        url: publicCollectionUrl(collection.handle)
      }))
    }
  };
}

export function buildPublicCollectionJsonLd(settings: PublicCollectionSettings, records: DemoInstrument[]) {
  const url = publicCollectionUrl(settings.handle);
  const description = settings.bio || `Explore ${settings.publicName}'s public QRguitar Profiles.`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    url,
    name: `${settings.publicName} Collection`,
    description,
    isPartOf: { "@type": "WebSite", name: "QRguitar", url: SITE_URL },
    breadcrumb: breadcrumbList([
      { name: "QRguitar", url: SITE_URL },
      { name: "Member Collections", url: absoluteSiteUrl("/collections") },
      { name: settings.publicName, url }
    ]),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: records.length,
      itemListElement: records.map((record, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: instrumentDisplayName(record),
        url: absoluteSiteUrl(record.permanentPath || `/i/${encodeURIComponent(record.qrCode)}`)
      }))
    }
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function getRecordMetadataImage(instrument: DemoInstrument) {
  const hero = String(instrument.heroImageDataUrl || "").trim();
  if (/^(https?:\/\/|\/(?!\/))/i.test(hero)) {
    return absoluteSiteUrl(hero);
  }

  const firstGallery = instrument.galleryImageDataUrls?.find((source) =>
    /^(https?:\/\/|\/(?!\/))/i.test(String(source || "").trim())
  );
  if (firstGallery) {
    return absoluteSiteUrl(firstGallery);
  }

  return absoluteSiteUrl(DEFAULT_OG_IMAGE);
}

export function getRecordMetadataDescription(instrument: DemoInstrument) {
  return metadataExcerpt(getRecordStructuredDescription(instrument), SEARCH_DESCRIPTION_MAX_LENGTH);
}

export function getRecordStructuredDescription(instrument: DemoInstrument) {
  const lead = [
    normalizeMetadataText(instrument.brand),
    normalizeMetadataText(instrument.model),
    normalizeMetadataText(instrument.year),
    normalizeMetadataText(instrument.qrCode)
  ].filter(Boolean);

  const summary = normalizeMetadataText(instrument.summary);
  const base = lead.join(" - ");

  if (summary) {
    return base ? `${base}. ${summary}` : summary;
  }

  return base ? `${base}. QRguitar Profile.` : DEFAULT_DESCRIPTION;
}

export function buildRecordMetadata(instrument: DemoInstrument): Metadata {
  const fullTitle = normalizeMetadataText(instrumentDisplayName(instrument));
  const title = metadataExcerpt(fullTitle, SEARCH_TITLE_MAX_LENGTH);
  const description = getRecordMetadataDescription(instrument);
  const socialTitle = metadataExcerpt(fullTitle, SOCIAL_TITLE_MAX_LENGTH);
  const socialDescription = metadataExcerpt(getRecordStructuredDescription(instrument), SOCIAL_DESCRIPTION_MAX_LENGTH);
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);

  return {
    title,
    description,
    robots: {
      index: instrument.visibility !== "unlisted" && instrument.visibility !== "private",
      follow: true
    },
    alternates: {
      canonical: url
    },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url,
      siteName: "QRguitar",
      type: "article",
      images: [
        {
          url: image,
          alt: `${title} QRguitar Profile photo`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: socialDescription,
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
  const title = normalizeMetadataText(instrumentDisplayName(instrument));
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);
  const description = getRecordStructuredDescription(instrument);
  const profileId = `${url}#profile`;
  const breadcrumbId = `${url}#breadcrumb`;
  const identifiers = [
    {
      "@type": "PropertyValue",
      propertyID: "QRguitar Profile",
      value: instrument.qrCode
    },
    instrument.serial
      ? {
          "@type": "PropertyValue",
          propertyID: "Serial number",
          value: instrument.serial
        }
      : null
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemPage",
        "@id": `${url}#page`,
        url,
        name: title,
        description,
        breadcrumb: { "@id": breadcrumbId },
        mainEntity: { "@id": profileId }
      },
      {
        "@type": "Thing",
        "@id": profileId,
        name: title,
        description,
        image: [image],
        url,
        identifier: identifiers
      },
      {
        ...breadcrumbList([
          { name: "Home", url: SITE_URL },
          { name: "Catalog", url: absoluteSiteUrl("/catalog") },
          { name: title, url }
        ]),
        "@id": breadcrumbId
      }
    ]
  };
}
