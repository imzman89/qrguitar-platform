"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { safeAuthRedirect } from "../lib/auth-redirect";
import {
  clearQrGuitarSessionState,
  createBrowserSupabaseClient,
  lastActivityAtKey,
  readSessionStorage,
  sessionExpiredMessageKey,
  sessionIdentityKey,
  sessionStartedAtKey,
  writeSessionStorage
} from "../lib/supabase-browser";

const normalIdleMs = 8 * 60 * 60 * 1000;
const adminIdleMs = 8 * 60 * 60 * 1000;
const absoluteMaxMs = 14 * 24 * 60 * 60 * 1000;
const activityWriteThrottleMs = 30 * 1000;

function numericStorageValue(key: string) {
  const value = readSessionStorage(key);
  const parsed = value ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function routeUsesAdminTimeout(pathname: string) {
  return pathname === "/site-editor" || pathname.startsWith("/admin");
}

function routeRequiresSession(pathname: string) {
  return pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/create" ||
    pathname === "/account" ||
    pathname === "/site-editor" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/edit/") ||
    pathname.startsWith("/service-review/");
}

function sessionTimestamp(session: { user?: { last_sign_in_at?: string | null } | null } | null) {
  const signInAt = session?.user?.last_sign_in_at ? Date.parse(session.user.last_sign_in_at) : 0;
  return Number.isFinite(signInAt) && signInAt > 0 ? signInAt : Date.now();
}

function sessionClock(session: { access_token?: string; user: { id: string; last_sign_in_at?: string | null } }) {
  let sessionId = "";
  try {
    const parts = session.access_token?.split(".");
    if (parts?.length === 3) {
      const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
      if (typeof payload?.session_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id)) sessionId = payload.session_id;
    }
  } catch { /* Older or unavailable token metadata falls back to the sign-in timestamp. */ }
  // This decoded claim identifies local clock metadata only; it never grants access.
  const identity = JSON.stringify([session.user.id, sessionId ? `session:${sessionId}` : session.user.last_sign_in_at || ""]);
  const previousIdentity = readSessionStorage(sessionIdentityKey);
  const changed = previousIdentity !== null && previousIdentity !== identity;
  const fallbackStartedAt = sessionTimestamp(session);
  const startedAt = (!changed && numericStorageValue(sessionStartedAtKey)) || fallbackStartedAt;
  const lastActivityAt = (!changed && numericStorageValue(lastActivityAtKey)) || fallbackStartedAt;
  writeSessionStorage(sessionIdentityKey, identity);
  writeSessionStorage(sessionStartedAtKey, String(startedAt));
  writeSessionStorage(lastActivityAtKey, String(lastActivityAt));
  return { startedAt, lastActivityAt, identity };
}

export function SessionLifecycle() {
  const router = useRouter();
  const pathname = usePathname();
  const sessionActiveRef = useRef(false);
  const lastWriteRef = useRef(0);
  const pathnameRef = useRef(pathname || "/");

  useEffect(() => {
    pathnameRef.current = pathname || "/";
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    let authRevision = 0;
    let actorId = "";
    let actorEpoch = 0;
    let clockIdentity = "";
    let expiryOperation: symbol | undefined;
    let expiryIdentity = "";
    const supabase = createBrowserSupabaseClient();

    async function expireSession(revision: number, expectedActor: string) {
      if (cancelled || expiryOperation || revision !== authRevision || actorId !== expectedActor) {
        return;
      }
      const operation = Symbol("expire-session");
      const expiredEpoch = actorEpoch;
      const expiredIdentity = clockIdentity;
      expiryOperation = operation;
      expiryIdentity = expiredIdentity;
      const current = () => !cancelled && expiryOperation === operation && (
        (actorEpoch === expiredEpoch && actorId === expectedActor && clockIdentity === expiredIdentity) ||
        (actorEpoch === expiredEpoch + 1 && actorId === "")
      );
      sessionActiveRef.current = false;
      try {
        const result = await supabase.auth.signOut();
        if (!current() || (result.error && actorId)) return;
        clearQrGuitarSessionState();
        writeSessionStorage(sessionExpiredMessageKey, "Your session expired. Please sign in again.");
        window.dispatchEvent(new CustomEvent("qrguitar:auth"));
        const location = new URL(window.location.href || `${window.location.pathname}${window.location.search}${window.location.hash}`, "https://qrguitar.invalid");
        const currentPath = location.pathname;
        if (routeRequiresSession(currentPath)) {
          const destination = safeAuthRedirect(`${currentPath}${location.search}${location.hash}`);
          router.replace(`/login?reason=session-expired&next=${encodeURIComponent(destination)}`);
        }
      } catch { /* A failed sign-out is not a confirmed anonymous session. Retry the expired clock on the next check. */ }
      finally { if (expiryOperation === operation) { expiryOperation = undefined; expiryIdentity = ""; } }
    }

    async function checkSession() {
      if (expiryOperation) return false;
      const revision = authRevision;
      const { data, error } = await supabase.auth.getSession();
      if (cancelled || revision !== authRevision || error) return false;
      const session = data.session;

      if (!session?.user) {
        if (actorId) actorEpoch++;
        actorId = ""; clockIdentity = "";
        sessionActiveRef.current = false;
        clearQrGuitarSessionState();
        return false;
      }

      sessionActiveRef.current = true;
      const now = Date.now();
      const { startedAt, lastActivityAt, identity } = sessionClock(session);
      if (clockIdentity !== identity) actorEpoch++;
      clockIdentity = identity; actorId = session.user.id;

      const idleLimit = routeUsesAdminTimeout(pathnameRef.current || "/") ? adminIdleMs : normalIdleMs;
      if (now - lastActivityAt > idleLimit || now - startedAt > absoluteMaxMs) {
        await expireSession(revision, session.user.id);
        return false;
      }
      return true;
    }

    function recordActivity(force = false) {
      if (!sessionActiveRef.current) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastWriteRef.current < activityWriteThrottleMs) {
        return;
      }

      lastWriteRef.current = now;
      writeSessionStorage(lastActivityAtKey, String(now));
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void checkSession().then((active) => { if (active) recordActivity(true); }).catch(() => undefined);
      }
    }

    const handleActivity = () => recordActivity();
    const activityEvents = ["click", "keydown", "pointerdown", "touchstart", "scroll"] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    void checkSession().catch(() => undefined);
    const interval = window.setInterval(() => {
      void checkSession().catch(() => undefined);
    }, 60 * 1000);

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Initial provider-read errors are not confirmed sign-out events.
      if (_event === "INITIAL_SESSION") return;
      authRevision++;
      if (!session?.user) {
        if (actorId) actorEpoch++;
        actorId = ""; clockIdentity = "";
        sessionActiveRef.current = false;
        clearQrGuitarSessionState();
        return;
      }

      // SIGNED_IN also fires when an existing tab resumes; it is not a new login.
      const { identity } = sessionClock(session);
      if (clockIdentity !== identity) actorEpoch++;
      clockIdentity = identity; actorId = session.user.id;
      sessionActiveRef.current = !expiryOperation || clockIdentity !== expiryIdentity;
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
