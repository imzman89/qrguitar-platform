"use client";

import Link from "next/link";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";

export default function CollectionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <><Nav /><main className="section"><div className="shell"><div className="empty-state" role="alert">
    <h1>Collections are temporarily unavailable.</h1><p>We couldn’t load the public collections. Please try again in a moment.</p>
    <div className="form-actions"><button className="button" type="button" onClick={reset}>Try again</button><Link className="button secondary" href="/catalog">Browse instrument Profiles</Link></div>
  </div></div></main><Footer /></>;
}
