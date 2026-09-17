import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getPublicInstruments } from "../../lib/public-instruments";
import { buildCollectionDirectory } from "../../lib/collection-directory";
import { CollectionsDirectoryClient } from "./CollectionsDirectoryClient";
import styles from "./collections.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Member Collections | QRguitar",
  description: "Explore public instrument collections from QRguitar players, collectors, shops, builders, and service professionals.",
  alternates: { canonical: "https://www.qrguitar.com/collections" }
};

export default async function CollectionsDirectoryPage() {
  const records = await getPublicInstruments();
  const collections = buildCollectionDirectory(records);

  return <>
    <Nav />
    <main className="section collection-directory-page">
      <div className="shell">
        <nav className={styles.navigation} aria-label="Explore QRguitar"><Link href="/catalog">Browse instrument Profiles</Link><Link href="/account?section=collection">Your collection settings</Link></nav>
        <header className="collection-directory-hero"><div><div className="eyebrow">Member collections</div><h1>Meet the people behind the instruments.</h1><p>Explore public collections from players, collectors, stores, builders, brands, and repair shops. Open a collection to view that member’s public instrument Profiles.</p></div>{collections.length ? <Link className="button" href="/account?section=collection">Publish your collection</Link> : null}</header>
        <CollectionsDirectoryClient collections={collections} />
      </div>
    </main>
    <Footer />
  </>;
}
