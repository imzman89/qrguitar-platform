import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { getProfilePhotoUrls } from "../../lib/instrument-profile-contract";
import { getPublicInstruments } from "../../lib/public-instruments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Member Collections | QRguitar",
  description: "Explore public instrument collections from QRguitar players, collectors, shops, builders, and service professionals.",
  alternates: { canonical: "https://www.qrguitar.com/collections" }
};

export default async function CollectionsDirectoryPage() {
  const records = await getPublicInstruments();
  const grouped = new Map<string, { handle: string; name: string; accountType: string; count: number; image: string }>();
  for (const record of records) {
    const collection = record.publicCollection;
    if (!collection?.handle || !collection.publicName) continue;
    const existing = grouped.get(collection.handle);
    const image = getProfilePhotoUrls(record)[0] || "";
    grouped.set(collection.handle, existing
      ? { ...existing, count: existing.count + 1, image: existing.image || image }
      : { handle: collection.handle, name: collection.publicName, accountType: collection.accountType, count: 1, image });
  }
  const collections = [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return <>
    <Nav />
    <main className="section collection-directory-page">
      <div className="shell">
        <header className="collection-directory-hero"><div><div className="eyebrow">Member collections</div><h1>See who is building, playing, repairing, and collecting.</h1><p>Open public collections from players, shops, builders, brands, and service professionals. Each instrument keeps its own permanent QRguitar Profile.</p></div><Link className="button" href="/account?section=collection">Create your collection page</Link></header>
        {collections.length ? <div className="collection-directory-grid">{collections.map((collection) => <Link className="collection-directory-card" href={`/collections/${collection.handle}`} key={collection.handle}>{collection.image ? <img src={collection.image} alt="" /> : <div className="collection-directory-placeholder" aria-hidden="true">QR</div>}<div><span>{collection.accountType || "Member"}</span><h2>{collection.name}</h2><p>{collection.count} public {collection.count === 1 ? "Profile" : "Profiles"}</p></div></Link>)}</div> : <div className="empty-state"><h2>No public collections yet.</h2><p>Public Profiles remain available in the Catalog.</p><Link className="button secondary" href="/catalog">Open the Catalog</Link></div>}
      </div>
    </main>
    <Footer />
  </>;
}
