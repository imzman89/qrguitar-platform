"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { BulkProfileImport } from "./BulkProfileImport";

export function BulkImportWorkspace() {
  const [sessionState, setSessionState] = useState<"checking" | "signed-in" | "signed-out">("checking");

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSessionState(data.session?.user ? "signed-in" : "signed-out");
    });

    return () => { active = false; };
  }, []);

  if (sessionState === "checking") {
    return <section className="auth-state-card" aria-live="polite"><span className="eyebrow">Bulk Import</span><h1>Opening your inventory workspace...</h1></section>;
  }

  if (sessionState === "signed-out") {
    return <section className="auth-state-card"><span className="eyebrow">Owner tools</span><h1>Sign in to import inventory.</h1><p>Bulk Import creates private QRguitar Profiles inside your owner workspace.</p><Link className="button" href="/login?next=/dashboard/import">Sign in</Link></section>;
  }

  return <BulkProfileImport />;
}
