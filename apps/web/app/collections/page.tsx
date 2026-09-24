
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

        <header className="collection-directory-hero"><div><div className="eyebrow">{ui("ui.app.collections.page.2595f0c366bf", "Member collections")}</div><h1>{ui("ui.app.collections.page.9fa7b03bfc1e", "Meet the people behind the instruments.")}</h1><p>{ui("ui.app.collections.page.f34365151941", "Explore public collections from players, collectors, stores, builders, brands, and repair shops. Open a collection to view that member’s public instrument Profiles.")}</p></div>{collections.length ? <Link className="button" href="/account?section=collection">{ui("ui.app.collections.page.82a7887fd1d5", "Set up your collection")}</Link> : null}</header>
        <CollectionsDirectoryClient collections={collections} />
        {collections.length ? <nav className={styles.navigation} aria-label={ui("ui.app.collections.page.aa8729a8a143", "Explore QRguitar")}><Link href="/catalog">{ui("ui.app.collections.page.f507fb6c23a7", "Browse instrument Profiles")}</Link><Link href="/account?section=collection">{ui("ui.app.collections.page.5ca6750bbc16", "Your collection settings")}</Link></nav> : null}
      </div>
    </main>
    <Footer />
  </>;
}
