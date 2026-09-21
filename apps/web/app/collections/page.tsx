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
  const records = await getPublicInstruments();
  const collections = buildCollectionDirectory(records);
  const jsonLd = buildCollectionsDirectoryJsonLd(collections);

  return <>
    <script id="qrguitar-collections-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <Nav />
    <main className={`section collection-directory-page ${styles.directory}`}>
      <div className="shell">

        <header className="collection-directory-hero"><div><div className="eyebrow">Member collections</div><h1>Meet the people behind the instruments.</h1><p>Explore public collections from players, collectors, stores, builders, brands, and repair shops. Open a collection to view that member’s public instrument Profiles.</p></div>{collections.length ? <Link className="button" href="/account?section=collection">Set up your collection</Link> : null}</header>
        <CollectionsDirectoryClient collections={collections} />
        <nav className={styles.navigation} aria-label="Explore QRguitar"><Link href="/catalog">Browse instrument Profiles</Link><Link href="/account?section=collection">Your collection settings</Link></nav>
      </div>
    </main>
    <Footer />
  </>;
}
