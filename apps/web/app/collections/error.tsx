"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "next/link";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";

export default function CollectionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ui = useUiText("app.collections.error");
  return <><Nav /><main className="section"><div className="shell"><div className="empty-state" role="alert">
    <h1>{ui("ui.app.collections.error.eb1041a620a1", "Collections are temporarily unavailable.")}</h1><p>{ui("ui.app.collections.error.927f9bad2531", "We couldn’t load the public collections. Please try again in a moment.")}</p>
    <div className="form-actions"><button className="button" type="button" onClick={reset}>{ui("ui.app.collections.error.d8b8392e2c54", "Try again")}</button><Link className="button secondary" href="/catalog">{ui("ui.app.collections.error.f507fb6c23a7", "Browse instrument Profiles")}</Link></div>
  </div></div></main><Footer /></>;
}
