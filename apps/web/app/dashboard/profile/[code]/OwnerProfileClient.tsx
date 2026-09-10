"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemoInstrument } from "../../../../lib/local-demo";
import { createBrowserSupabaseClient } from "../../../../lib/supabase-browser";
import { fetchOwnerProfile, OwnerProfileError } from "../../../../lib/owner-profile";
import { Nav } from "../../../../components/Nav";
import { ProfileClient } from "../../../i/[code]/ProfileClient";

export function OwnerProfileClient({ code }: { code: string }) {
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signin" | "missing" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let controller: AbortController | undefined;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    setInstrument(null);
    setStatus("loading");
    try { supabase = createBrowserSupabaseClient(); }
    catch { setStatus("error"); return; }
    async function load(token: string) {
      const request = ++generation;
      controller?.abort();
      setInstrument(null);
      if (!token) { setStatus("signin"); return; }
      setStatus("loading");
      const requestController = new AbortController();
      controller = requestController;
      const timer = setTimeout(() => requestController.abort(), 20000);
      try {
        const record = await fetchOwnerProfile(code, token, requestController.signal);
        if (!disposed && request === generation) { setInstrument(record); setStatus("ready"); }
      } catch (error) {
        if (!disposed && request === generation) {
          setStatus(error instanceof OwnerProfileError && error.status === 401 ? "signin"
            : error instanceof OwnerProfileError && error.status === 404 ? "missing" : "error");
        }
      } finally { clearTimeout(timer); }
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && generation === 0) void load(data.session?.access_token || "");
    }).catch(() => { if (!disposed && generation === 0) setStatus("error"); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!disposed) void load(session?.access_token || "");
    });
    return () => { disposed = true; generation++; controller?.abort(); listener.subscription.unsubscribe(); };
  }, [code, attempt]);

  if (status === "ready" && instrument && instrument.qrCode.toUpperCase() === code.toUpperCase()) {
    return <ProfileClient code={code} initialInstrument={instrument} ownerPreview />;
  }
  return <><Nav /><main className="owner-profile-gate">
    <span className="eyebrow">Your collection</span>
    <h1>{status === "loading" ? "Opening your Profile…" : status === "signin" ? "Sign in to view your Profile" : status === "missing" ? "Profile unavailable" : "We could not load your Profile"}</h1>
    <p role={status === "error" ? "alert" : "status"}>{status === "loading" ? "Checking your account and loading the instrument."
      : status === "signin" ? "Private Profiles are available only to their owner."
      : status === "missing" ? "This Profile is not available to this account. Check that you are signed in to the account that owns it."
      : "Your Profile has not changed. Check your connection and try again."}</p>
    <div className="owner-profile-actions">
      {status === "signin" ? <Link className="button" href={"/login?next=" + encodeURIComponent("/dashboard/profile/" + code)}>Sign in</Link> : null}
      {status === "error" ? <button type="button" className="button" onClick={() => setAttempt(value => value + 1)}>Try again</button> : null}
      <Link className="button secondary" href="/dashboard">Back to collection</Link>
    </div>
  </main></>;
}

