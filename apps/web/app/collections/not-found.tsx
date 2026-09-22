
"use client";
import { useUiText } from "../../components/UiTextProvider";
import Link from "next/link";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";

export default function CollectionNotFound() {
  const ui = useUiText("app.collections.not.found");
  return <><Nav /><main className="section"><div className="shell"><div className="empty-state">
    <h1>{ui("ui.app.collections.not.found.e7222eacd9d8", "This collection is unavailable.")}</h1><p>{ui("ui.app.collections.not.found.5ea4d5b19d17", "Its public link may have changed, or the member may no longer be sharing it.")}</p>
    <div className="form-actions"><Link className="button" href="/collections">{ui("ui.app.collections.not.found.6b2f6b98c835", "Explore member collections")}</Link><Link className="button secondary" href="/catalog">{ui("ui.app.collections.not.found.f507fb6c23a7", "Browse instrument Profiles")}</Link></div>
  </div></div></main><Footer /></>;
}
