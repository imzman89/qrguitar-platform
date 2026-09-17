import Link from "next/link";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";

export default function CollectionNotFound() {
  return <><Nav /><main className="section"><div className="shell"><div className="empty-state">
    <h1>This collection is unavailable.</h1><p>Its public link may have changed, or the member may no longer be sharing it.</p>
    <div className="form-actions"><Link className="button" href="/collections">Explore member collections</Link><Link className="button secondary" href="/catalog">Browse instrument Profiles</Link></div>
  </div></div></main><Footer /></>;
}
