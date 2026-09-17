import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { collectionRoleLabel } from "../../../lib/collection-directory";
import { loadPublicCollectionSettings } from "../../../lib/public-collection-page";
import { getPublicInstruments } from "../../../lib/public-instruments";
import { CollectionsClient } from "./CollectionsClient";
import { loadPublishedSiteSettings } from "../../../lib/site-settings-server";
import { CollectionInquiryForm } from "../../../components/CollectionInquiryForm";
import { SellerWebsiteLink } from "../../../components/SellerWebsiteLink";
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
  if (!result) return { title: "Collection unavailable | QRguitar", robots: { index: false, follow: false } };
  return {
    title: `${result.settings.publicName} Collection | QRguitar`,
    description: result.settings.bio || `Explore ${result.settings.publicName}'s public QRguitar Profiles.`,
    alternates: { canonical: `https://www.qrguitar.com/collections/${result.settings.handle}` },
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
  return <>
    <Nav />
    <main className="page-shell collection-page">
      <nav className={styles.navigation} aria-label="Collection navigation"><Link href="/collections"><ArrowLeft size={16} aria-hidden="true" /> All member collections</Link><Link href="/catalog">Browse instrument Profiles</Link></nav>
      <header className="collection-header">
        {settings.avatarUrl ? <img src={settings.avatarUrl} alt="" /> : <div className="collection-avatar" aria-hidden="true">{settings.publicName.slice(0, 1).toUpperCase()}</div>}
        <div><span className="eyebrow">Public Collection</span><h1>{settings.publicName}</h1><p className="collection-role">{role}{settings.location ? ` / ${settings.location}` : ""}</p>{settings.bio ? <p>{settings.bio}</p> : null}<SellerWebsiteLink {...settings} /></div>
        <strong className="collection-count">{records.length}<small>Public {records.length === 1 ? "Profile" : "Profiles"}</small></strong>
      </header>
      <CollectionsClient key={settings.handle} records={records} content={publishedSettings.content} />
      {settings.allowMessages ? <CollectionInquiryForm handle={settings.handle} publicName={settings.publicName} profiles={records.map((record) => ({ code: record.qrCode, title: record.name || [record.brand, record.model].filter(Boolean).join(" ") || record.qrCode }))} /> : null}
    </main>
    <Footer />
  </>;
}
