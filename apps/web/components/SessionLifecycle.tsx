"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  clearQrGuitarSessionState,
  createBrowserSupabaseClient,
  lastActivityAtKey,
  sessionExpiredMessageKey,
  sessionStartedAtKey
} from "../lib/supabase-browser";

const normalIdleMs = 8 * 60 * 60 * 1000;
const adminIdleMs = 8 * 60 * 60 * 1000;
const absoluteMaxMs = 14 * 24 * 60 * 60 * 1000;
const activityWriteThrottleMs = 30 * 1000;

function numericStorageValue(key: string) {
  const value = window.localStorage.getItem(key);
  const parsed = value ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function routeUsesAdminTimeout(pathname: string) {
  return pathname === "/site-editor" || pathname.startsWith("/admin");
}

function routeCanStayAfterExpiry(pathname: string) {
  return pathname === "/login" || pathname === "/reset-password";
}

function sessionTimestamp(session: { user?: { last_sign_in_at?: string | null } | null } | null) {
  const signInAt = session?.user?.last_sign_in_at ? Date.parse(session.user.last_sign_in_at) : 0;
  return Number.isFinite(signInAt) && signInAt > 0 ? signInAt : Date.now();
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
    const supabase = createBrowserSupabaseClient();

    async function expireSession() {
      if (cancelled) {
        return;
      }

      sessionActiveRef.current = false;
      clearQrGuitarSessionState();
      window.localStorage.setItem(sessionExpiredMessageKey, "Your session expired. Please sign in again.");
      await supabase.auth.signOut();
      window.dispatchEvent(new CustomEvent("qrguitar:auth"));

      const currentPath = pathnameRef.current || "/";
      if (!routeCanStayAfterExpiry(currentPath)) {
        router.replace(`/login?reason=session-expired&next=${encodeURIComponent(currentPath)}`);
      }
    }

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user) {
        sessionActiveRef.current = false;
        clearQrGuitarSessionState();
        return;
      }

      sessionActiveRef.current = true;
      const now = Date.now();
      const fallbackStartedAt = sessionTimestamp(session);
      const startedAt = numericStorageValue(sessionStartedAtKey) || fallbackStartedAt;
      const lastActivityAt = numericStorageValue(lastActivityAtKey) || fallbackStartedAt;

      window.localStorage.setItem(sessionStartedAtKey, String(startedAt));
      window.localStorage.setItem(lastActivityAtKey, String(lastActivityAt));

      const idleLimit = routeUsesAdminTimeout(pathnameRef.current || "/") ? adminIdleMs : normalIdleMs;
      if (now - lastActivityAt > idleLimit || now - startedAt > absoluteMaxMs) {
        await expireSession();
      }
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
      window.localStorage.setItem(lastActivityAtKey, String(now));
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void checkSession().then(() => recordActivity(true));
      }
    }

    const handleActivity = () => recordActivity();
    const activityEvents = ["click", "keydown", "pointerdown", "touchstart", "scroll"] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    void checkSession();
    const interval = window.setInterval(() => {
      void checkSession();
    }, 60 * 1000);

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        sessionActiveRef.current = false;
        clearQrGuitarSessionState();
        return;
      }

      sessionActiveRef.current = true;
      if (event === "SIGNED_IN" || !numericStorageValue(sessionStartedAtKey)) {
        const now = Date.now();
        window.localStorage.setItem(sessionStartedAtKey, String(now));
        window.localStorage.setItem(lastActivityAtKey, String(now));
      }
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
