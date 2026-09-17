"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "./supabase-browser";
import { observeSessionIdentity } from "./session-identity";

/** Shared status and honest sign-out feedback for navigation and footer controls. */
export function useAuthNavigation() {
  const [signedIn, setSignedIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const actor = useRef("");
  const revision = useRef(0);
  const active = useRef(false);
  const pending = useRef(false);
  const client = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);

  const identityChanged = useCallback((next: string) => {
    if (actor.current !== next) {
      revision.current++;
      actor.current = next;
      setLogoutError("");
    }
    setSignedIn(Boolean(next));
  }, []);

  useEffect(() => {
    active.current = true;
    try {
      client.current = createBrowserSupabaseClient();
      const unsubscribe = observeSessionIdentity(client.current.auth, identityChanged);
      return () => { active.current = false; client.current = null; unsubscribe(); };
    } catch {
      identityChanged("");
      return () => { active.current = false; client.current = null; };
    }
  }, [identityChanged]);

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

  return { signedIn, signingOut, logoutError, logout, clearLogoutError: () => setLogoutError("") };
}
