"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "./supabase-browser";
import { observeSessionIdentity } from "./session-identity";

/** Shared status and honest sign-out feedback for navigation and footer controls. */
export function useAuthNavigation() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState(false);
  const [retryEpoch, setRetryEpoch] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const actor = useRef("");
  const revision = useRef(0);
  const active = useRef(false);
  const pending = useRef(false);
  const client = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const retry = useRef<() => void>(() => undefined);
  const needsRetry = useRef(false);

  const identityChanged = useCallback((next: string) => {
    if (actor.current !== next) {
      revision.current++;
      actor.current = next;
      setLogoutError("");
    }
    setSignedIn(Boolean(next));
    setAuthError(false);
    needsRetry.current = false;
  }, []);

  useEffect(() => {
    active.current = true;
    try {
      client.current = createBrowserSupabaseClient();
      const unsubscribe = observeSessionIdentity(client.current.auth, identityChanged, {
        onResolving: () => { setSignedIn(null); setAuthError(false); },
        onError: () => { setSignedIn(null); setAuthError(true); needsRetry.current = true; }
      });
      retry.current = unsubscribe.refresh;
      const resume = () => { if (needsRetry.current) retry.current(); };
      if (typeof window !== "undefined") { window.addEventListener("focus", resume); window.addEventListener("online", resume); window.addEventListener("pageshow", resume); }
      return () => { active.current = false; client.current = null; retry.current = () => undefined; unsubscribe(); if (typeof window !== "undefined") { window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener("pageshow", resume); } };
    } catch {
      setSignedIn(null); setAuthError(true);
      retry.current = () => setRetryEpoch((value) => value + 1);
      return () => { active.current = false; client.current = null; };
    }
  }, [identityChanged, retryEpoch]);

  async function logout() {
    if (!active.current || !actor.current || !client.current || pending.current) return false;
    pending.current = true;
    setSigningOut(true);
    setLogoutError("");
    const previousActor = actor.current;
    const previousRevision = revision.current;
    const stillSameSession = () => active.current && (
      (actor.current === previousActor && revision.current === previousRevision) ||
      (actor.current === "" && revision.current === previousRevision + 1)
    );
    try {
      const { error } = await client.current.auth.signOut();
      if (error) throw error;
      if (!stillSameSession()) return false;
      clearQrGuitarSessionState();
      identityChanged("");
      return true;
    } catch {
      if (active.current && actor.current === previousActor && revision.current === previousRevision) {
        setLogoutError("Could not sign out. Please try again.");
      } else if (stillSameSession() && actor.current === "") {
        // Supabase may clear this device before returning a remote revocation error.
        clearQrGuitarSessionState();
        setLogoutError("You are signed out on this device. Sign-out on other devices could not be confirmed.");
      }
      return false;
    } finally {
      pending.current = false;
      if (active.current) setSigningOut(false);
    }
  }

  return { signedIn, authError, retrySession: () => retry.current(), signingOut, logoutError, logout, clearLogoutError: () => setLogoutError("") };
}
