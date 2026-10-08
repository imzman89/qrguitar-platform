"use client";
import { useUiText } from "../../../components/UiTextProvider";


import Link from "next/link";

export default function ProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ui = useUiText("app.i.code.error");
  return (
    <main className="section">
      <div className="shell">
        <div className="empty-state" role="alert">
          <h1>{ui("ui.app.i.code.error.38d1e200dd2a", "This Profile is temporarily unavailable.")}</h1>
          <p>{ui("ui.app.i.code.error.42fcc94b6c14", "We couldn’t load this Profile. Please try again in a moment.")}</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={reset}>{ui("ui.app.i.code.error.d8b8392e2c54", "Try again")}</button>
            <Link className="button secondary" href="/">{ui("ui.app.i.code.error.723e1c99cb42", "Back to QRguitar")}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
