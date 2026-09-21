import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { FallbackImage } from "../../../components/FallbackImage";
import { Nav } from "../../../components/Nav";
import { collectionRoleLabel } from "../../../lib/collection-directory";
import { loadPublicCollectionSettings } from "../../../lib/public-collection-page";
import { getPublicInstruments } from "../../../lib/public-instruments";
import { CollectionsClient } from "./CollectionsClient";
import { loadPublishedSiteSettings } from "../../../lib/site-settings-server";
import { SellerWebsiteLink } from "../../../components/SellerWebsiteLink";
import { MemberMessageLink } from "../../../components/MemberMessageLink";
import { buildPageMetadata, buildPrivatePageMetadata, buildPublicCollectionJsonLd, metadataExcerpt, SEARCH_TITLE_MAX_LENGTH, serializeJsonLd } from "../../../lib/seo";
import styles from "../collections.module.css";

export const dynamic = "force-dynamic";

async function loadCollection(handleValue: string) {
  const settings = await loadPublicCollectionSettings(handleValue);
  if (!settings) return null;
  const ownerId = settings.ownerId;
  const records = await getPublicInstruments(ownerId);
  return { settings, records };
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const result = await loadCollection(handle);
  if (!result) return buildPrivatePageMetadata(
    "Collection unavailable",
    "This QRguitar collection is not available."
  );
  return {
    ...buildPageMetadata(
      `${result.settings.publicName} Collection`,
      result.settings.bio || `Explore ${result.settings.publicName}'s public QRguitar Profiles.`,
      `/collections/${encodeURIComponent(result.settings.handle)}`
    ),
    title: metadataExcerpt(`${result.settings.publicName} Collection | QRguitar`, SEARCH_TITLE_MAX_LENGTH),
    robots: { index: result.settings.allowIndexing && result.records.length > 0, follow: true }
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const result = await loadCollection(handle);
  if (!result) notFound();
  const { settings, records } = result;
  const publishedSettings = await loadPublishedSiteSettings();
  const role = collectionRoleLabel(settings.accountType);
  const jsonLd = buildPublicCollectionJsonLd(settings, records);
  return <>
    <script id="qrguitar-collection-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <Nav />
    <main className={`${styles.memberPage} page-shell collection-page`}>
      <nav className={styles.navigation} aria-label="Collection navigation"><Link href="/collections"><ArrowLeft size={16} aria-hidden="true" /> All collections</Link><Link href="/catalog">Catalog</Link></nav>
      <header className={`${styles.memberHero} collection-header`}>
        <div className={styles.memberIdentity}>
          <FallbackImage
            src={settings.avatarUrl}
            alt={`${settings.publicName} avatar`}
            width={112}
            height={112}
            loading="eager"
            fetchPriority="low"
            decoding="async"
            referrerPolicy="no-referrer"
            fallback={<div className="collection-avatar" aria-hidden="true">{settings.publicName.slice(0, 1).toUpperCase()}</div>}
          />
          <div><span className="eyebrow">QRguitar member</span><h1>{settings.publicName}</h1><p className="collection-role">{role}{settings.location ? ` / ${settings.location}` : ""}</p>{settings.bio ? <p className={styles.memberBio}>{settings.bio}</p> : <p className={styles.memberBio}>{"Explore this member's public QRguitar Profiles."}</p>}</div>
        </div>
        <div className={styles.memberActions}>
          <strong className="collection-count">{records.length}<small>Public {records.length === 1 ? "Profile" : "Profiles"}</small></strong>
          <div className={styles.actionRow}>
            {settings.allowMessages ? <MemberMessageLink handle={settings.handle} label={`Message ${settings.publicName}`} /> : null}
            <SellerWebsiteLink {...settings} />
          </div>
        </div>
      </header>
      <CollectionsClient key={settings.handle} records={records} content={publishedSettings.content} />
    </main>
    <Footer />
  </>;
}
