import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { cleanCollectionHandle, cleanPublicCollection, publicCollectionHandleKey, publicCollectionOwnerKey } from "../../../lib/public-collections";
import { getPublicInstruments } from "../../../lib/public-instruments";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { CollectionsClient } from "./CollectionsClient";
import { loadPublishedSiteSettings } from "../../../lib/site-settings-server";
import { CollectionInquiryForm } from "../../../components/CollectionInquiryForm";

export const dynamic = "force-dynamic";

async function loadCollection(handleValue: string) {
  const handle = cleanCollectionHandle(handleValue);
  const supabase = createServerSupabaseClient();
  if (!handle || !supabase) return null;
  const handleRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionHandleKey(handle)).maybeSingle<{ content_value?: { ownerId?: string } }>();
  const ownerId = String(handleRow.data?.content_value?.ownerId || "");
  if (!ownerId) return null;
  const ownerRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(ownerId)).maybeSingle<{ content_value?: Record<string, unknown> }>();
  const settings = cleanPublicCollection({ ...(ownerRow.data?.content_value || {}), ownerId });
  if (!settings.enabled || settings.handle !== handle || !settings.publicName) return null;
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
  const role = ({ player: "Player", collector: "Collector", shop: "Shop", builder: "Builder / Brand", luthier: "Luthier / Technician", other: "Instrument Community" } as const)[settings.accountType];
  return <>
    <Nav />
    <main className="page-shell collection-page">
      <header className="collection-header">
        {settings.avatarUrl ? <img src={settings.avatarUrl} alt="" /> : <div className="collection-avatar" aria-hidden="true">{settings.publicName.slice(0, 1).toUpperCase()}</div>}
        <div><span className="eyebrow">Public Collection</span><h1>{settings.publicName}</h1><p className="collection-role">{role}{settings.location ? ` / ${settings.location}` : ""}</p>{settings.bio ? <p>{settings.bio}</p> : null}{settings.websiteUrl ? <a href={settings.websiteUrl} target="_blank" rel="noreferrer">Visit website</a> : null}</div>
        <strong className="collection-count">{records.length}<small>Public {records.length === 1 ? "Profile" : "Profiles"}</small></strong>
      </header>
      <CollectionsClient records={records} content={publishedSettings.content} />
      {settings.allowMessages ? <CollectionInquiryForm handle={settings.handle} publicName={settings.publicName} profiles={records.map((record) => ({ code: record.qrCode, title: record.name || [record.brand, record.model].filter(Boolean).join(" ") || record.qrCode }))} /> : null}
    </main>
    <Footer />
  </>;
}
