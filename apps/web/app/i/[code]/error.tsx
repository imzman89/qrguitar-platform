"use client";

import Link from "next/link";

export default function ProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="section">
      <div className="shell">
        <div className="empty-state" role="alert">
          <h1>This Profile is temporarily unavailable.</h1>
          <p>We couldn’t load this Profile. Please try again in a moment.</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={reset}>Try again</button>
            <Link className="button secondary" href="/">Back to QRguitar</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
