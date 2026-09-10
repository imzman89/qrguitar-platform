"use client";

import Link from "next/link";

export default function CatalogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="section">
      <div className="shell">
        <div className="empty-state" role="alert">
          <h1>The catalog is temporarily unavailable.</h1>
          <p>We couldn’t load the public Profiles. Please try again in a moment.</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={reset}>Try again</button>
            <Link className="button secondary" href="/">Back to QRguitar</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
