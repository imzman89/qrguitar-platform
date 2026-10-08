"use client";
import { useUiText } from "./UiTextProvider";


import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { observeSessionIdentity } from "../lib/session-identity";
import { BulkProfileImport } from "./BulkProfileImport";

export function BulkImportWorkspace() {
  const ui = useUiText("components.BulkImportWorkspace");
  // null is the initial check; an empty identity is signed out. Count transitions
  // so a batched A → signed-out/B → A still disposes A's earlier controller.
  const [identity, setIdentity] = useState<{ actorId: string | null; generation: number }>({ actorId: null, generation: 0 });
  const actorId = identity.actorId;

  useEffect(() => {
    try {
      const supabase = createBrowserSupabaseClient();
      return observeSessionIdentity(supabase.auth, (nextActor) => {
        setIdentity((current) => current.actorId === nextActor ? current : { actorId: nextActor, generation: current.generation + 1 });
      });
    } catch {
      setIdentity((current) => ({ actorId: "", generation: current.generation + 1 }));
    }
  }, []);

  if (actorId === null) {
    return <section className="auth-state-card" aria-live="polite"><span className="eyebrow">{ui("ui.components.BulkImportWorkspace.01916f7252b9", "Bulk Import")}</span><h1>{ui("ui.components.BulkImportWorkspace.1c7215c1acc2", "Opening your inventory workspace...")}</h1></section>;
  }

  if (!actorId) {
    return <section className="auth-state-card"><span className="eyebrow">{ui("ui.components.BulkImportWorkspace.832fd327544b", "Owner tools")}</span><h1>{ui("ui.components.BulkImportWorkspace.96812e83690f", "Sign in to import inventory.")}</h1><p>{ui("ui.components.BulkImportWorkspace.897a89da498c", "Saved instruments and photos appear in Catalog.")}</p><Link className="button" href="/login?next=/dashboard/import">{ui("ui.components.BulkImportWorkspace.bfd402b2f6f3", "Sign in")}</Link></section>;
  }

  return <><p><Link className="text-link" href="/dashboard">{ui("ui.components.BulkImportWorkspace.backToCollection", "Back to my collection")}</Link></p><BulkProfileImport key={`${actorId}:${identity.generation}`} /></>;
}
