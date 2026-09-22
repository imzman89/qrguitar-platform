"use client";
import { useUiText } from "./UiTextProvider";


import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import styles from "./AdminWorkspaceGate.module.css";

export type AdminGatePhase = "checking" | "signed-out" | "expired" | "denied" | "unavailable" | "ready";

export function AdminWorkspaceGateView({ phase, returnPath, onRetry, onSignOut, signingOut, logoutError, children }: {
  phase: AdminGatePhase;
  returnPath: string;
  onRetry: () => void;
  onSignOut?: () => void;
  signingOut?: boolean;
  logoutError?: string;
  children: ReactNode;
}) {
  const ui = useUiText("components.AdminWorkspaceGate");
  if (phase === "ready") return <>{children}</>;
  const title = phase === "checking" ? "Checking access" : phase === "signed-out" ? "Sign in to continue"
    : phase === "expired" ? "Your session expired" : phase === "denied" ? "Admin access required" : "Admin is temporarily unavailable";
  const detail = phase === "checking" ? "Confirming your account."
    : phase === "signed-out" ? "This workspace is available to QRguitar administrators."
    : phase === "expired" ? "Sign out of this device, then sign in again to open this workspace."
    : phase === "denied" ? "This account does not have access to this workspace."
    : "We could not verify access right now. Try again in a moment.";
  return <main className={styles.page}>
    <div className={styles.content}>
      <Link className={styles.brand} href="/" aria-label={ui("ui.components.AdminWorkspaceGate.33b14c935c51", "QRguitar homepage")}><BrandLogo className={styles.logo} /></Link>
      <div className={styles.eyebrow}>{ui("ui.components.AdminWorkspaceGate.1300ecbecd41", "Admin workspace")}</div>
      <h1>{title}</h1>
      <p role={phase === "unavailable" ? "alert" : "status"}>{detail}</p>
      {logoutError ? <p role="alert">{logoutError}</p> : null}
      {phase !== "checking" ? <div className={styles.actions}>
        {phase === "signed-out" ? <Link className={styles.primary} href={`/login?next=${encodeURIComponent(returnPath)}`}>{ui("ui.components.AdminWorkspaceGate.bfd402b2f6f3", "Sign in")}</Link> : null}
        {phase === "expired" ? <button type="button" className={styles.primary} disabled={signingOut} onClick={onSignOut}>{signingOut ? ui("ui.components.AdminWorkspaceGate.08c6bd357b7d", "Signing out…") : ui("ui.components.AdminWorkspaceGate.897c73053d5d", "Sign out and sign in again")}</button> : null}
        {phase === "unavailable" ? <button type="button" className={styles.primary} onClick={onRetry}>{ui("ui.components.AdminWorkspaceGate.d8b8392e2c54", "Try again")}</button> : null}
        <Link href={phase === "denied" ? "/dashboard" : "/"}>{phase === "denied" ? ui("ui.components.AdminWorkspaceGate.1bb548bc8507", "Return to dashboard") : ui("ui.components.AdminWorkspaceGate.723e1c99cb42", "Back to QRguitar")}</Link>
      </div> : null}
    </div>
  </main>;
}

export function AdminWorkspaceGate({ returnPath, children }: { returnPath: string; children: ReactNode }) {
  const [phase, setPhase] = useState<AdminGatePhase>("checking");
  const [attempt, setAttempt] = useState(0);
  const actor = useRef("");
  const router = useRouter();
  const { logout, signingOut, logoutError } = useAuthNavigation();
  const retry = useCallback(() => { setPhase("checking"); setAttempt((value) => value + 1); }, []);
  const signOutAndContinue = useCallback(async () => {
    if (await logout()) router.replace(`/login?reason=session-expired&next=${encodeURIComponent(returnPath)}`);
  }, [logout, returnPath, router]);

  useEffect(() => {
    let current = true;
    let revision = 0;
    let request: AbortController | null = null;
    let auth: ReturnType<typeof createBrowserSupabaseClient>["auth"];
    try { auth = createBrowserSupabaseClient().auth; }
    catch { setPhase("unavailable"); return; }
    const check = async (nextActor: string, token: string | undefined) => {
      const selected = ++revision;
      request?.abort();
      const actorChanged = actor.current !== nextActor;
      actor.current = nextActor;
      if (!nextActor || !token) { setPhase("signed-out"); return; }
      if (actorChanged) setPhase("checking");
      const next = new AbortController();
      request = next;
      const timeout = window.setTimeout(() => next.abort(), 15000);
      try {
        const response = await fetch("/api/admin/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: next.signal });
        const payload = response.ok ? await response.json().catch(() => null) as { ok?: boolean } | null : null;
        if (!current || selected !== revision || actor.current !== nextActor) return;
        if (response.ok && payload?.ok === true) setPhase("ready");
        else setPhase(response.status === 401 ? "expired" : response.status === 403 ? "denied" : "unavailable");
      } catch {
        if (current && selected === revision && actor.current === nextActor) setPhase("unavailable");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    const subscription = auth.onAuthStateChange((_event, session) => { void check(session?.user.id || "", session?.access_token); });
    void auth.getSession().then(({ data }) => { if (current && revision === 0) void check(data.session?.user.id || "", data.session?.access_token); }).catch(() => { if (current && revision === 0) setPhase("unavailable"); });
    return () => { current = false; revision++; request?.abort(); subscription.data.subscription.unsubscribe(); };
  }, [attempt]);

  return <AdminWorkspaceGateView phase={phase} returnPath={returnPath} onRetry={retry} onSignOut={() => void signOutAndContinue()} signingOut={signingOut} logoutError={logoutError}>{children}</AdminWorkspaceGateView>;
}
