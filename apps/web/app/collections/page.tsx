
import { createUiText } from "../../lib/ui-text";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getPublicInstruments } from "../../lib/public-instruments";
import { buildCollectionDirectory } from "../../lib/collection-directory";
import { buildCollectionsDirectoryJsonLd, serializeJsonLd } from "../../lib/seo";
import { buildManagedPageMetadata } from "../../lib/site-metadata";
import { CollectionsDirectoryClient } from "./CollectionsDirectoryClient";
import styles from "./collections.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  return buildManagedPageMetadata("collections", "/collections");
}

export default async function CollectionsDirectoryPage() {
  const ui = createUiText((await loadPublishedSiteSettings()).content, "app.collections.page");
  const records = await getPublicInstruments();
  const collections = buildCollectionDirectory(records);
  const jsonLd = buildCollectionsDirectoryJsonLd(collections);

  return <>
    <script id="qrguitar-collections-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <Nav />
    <main className={`section collection-directory-page ${styles.directory}`}>
      <div className="shell">

        <header className="collection-directory-hero"><h1>{ui("ui.app.collections.page.9fa7b03bfc1e", "Collections")}</h1></header>
        <CollectionsDirectoryClient collections={collections} />
        {collections.length ? <nav className={styles.navigation} aria-label={ui("ui.app.collections.page.aa8729a8a143", "Explore QRguitar")}><Link href="/catalog">{ui("ui.app.collections.page.f507fb6c23a7", "Catalog")}</Link><Link href="/account?section=collection">{ui("ui.app.collections.page.5ca6750bbc16", "Collection settings")}</Link></nav> : null}
      </div>
    </main>
    <Footer />
  </>;
}
