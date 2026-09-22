"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "next/link";

export default function CatalogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ui = useUiText("app.catalog.error");
  return (
    <main className="section">
      <div className="shell">
        <div className="empty-state" role="alert">
          <h1>{ui("ui.app.catalog.error.1ab7aa5950e4", "The catalog is temporarily unavailable.")}</h1>
          <p>{ui("ui.app.catalog.error.41f6cfb6e43a", "We couldn’t load the public Profiles. Please try again in a moment.")}</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={reset}>{ui("ui.app.catalog.error.d8b8392e2c54", "Try again")}</button>
            <Link className="button secondary" href="/">{ui("ui.app.catalog.error.723e1c99cb42", "Back to QRguitar")}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
