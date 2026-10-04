"use client";
import { useUiText } from "../../../../components/UiTextProvider";


import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemoInstrument } from "../../../../lib/local-demo";
import { createBrowserSupabaseClient } from "../../../../lib/supabase-browser";
import { fetchOwnerProfile, OwnerProfileError } from "../../../../lib/owner-profile";
import { Nav } from "../../../../components/Nav";
import { ProfileClient } from "../../../i/[code]/ProfileClient";

export function OwnerProfileClient({ code }: { code: string }) {
  const ui = useUiText("app.dashboard.profile.code.OwnerProfileClient");
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
    <span className="eyebrow">{ui("ui.app.dashboard.profile.code.OwnerProfileClient.ownerDashboardPolicy.myCollection", "My collection")}</span>
    <h1>{status === "loading" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.ffad3e64048f", "Opening your Profile…") : status === "signin" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.46820bbeca47", "Sign in to view your Profile") : status === "missing" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.158e5a22a48c", "Profile unavailable") : ui("ui.app.dashboard.profile.code.OwnerProfileClient.cd563df66e7c", "We could not load your Profile")}</h1>
    <p role={status === "error" ? "alert" : "status"}>{status === "loading" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.f6b6e188e29b", "Checking your account and loading the instrument.")
      : status === "signin" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.ownerDashboardPolicy.signinHelp", "Sign in to the owning account to use owner tools.")
      : status === "missing" ? ui("ui.app.dashboard.profile.code.OwnerProfileClient.ownerDashboardPolicy.missingHelp", "Owner tools are not available to this account. Sign in to the owning account.")
      : ui("ui.app.dashboard.profile.code.OwnerProfileClient.f16a60aa884d", "Your Profile has not changed. Check your connection and try again.")}</p>
    <div className="owner-profile-actions">
      {status === "signin" ? <Link className="button" href={"/login?next=" + encodeURIComponent("/dashboard/profile/" + code)}>{ui("ui.app.dashboard.profile.code.OwnerProfileClient.bfd402b2f6f3", "Sign in")}</Link> : null}
      {status === "error" ? <button type="button" className="button" onClick={() => setAttempt(value => value + 1)}>{ui("ui.app.dashboard.profile.code.OwnerProfileClient.d8b8392e2c54", "Try again")}</button> : null}
      <Link className="button secondary" href="/dashboard">{ui("ui.app.dashboard.profile.code.OwnerProfileClient.4466f3a00b0b", "Back to collection")}</Link>
    </div>
  </main></>;
}

