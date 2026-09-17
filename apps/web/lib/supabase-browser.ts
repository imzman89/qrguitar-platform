"use client";

import { invalidateSitePreviewSession } from "./site-preview-client";
import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

export const sessionStartedAtKey = "qrguitar.sessionStartedAt";
export const lastActivityAtKey = "qrguitar.lastActivityAt";
export const sessionExpiredMessageKey = "qrguitar.sessionExpiredMessage";
export const sessionIdentityKey = "qrguitar.sessionIdentity";

// Browsers may deny persistent storage while still allowing an in-memory Auth session.
const sessionMemory = new Map<string, string>();
const pendingSessionStorage = new Map<string, string | null>();

function reconcileSessionStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    // Replay removals as well as writes before reading recovered storage.
    for (const [key, value] of pendingSessionStorage) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      pendingSessionStorage.delete(key);
    }
    return storage;
  } catch { return null; }
}

export function readSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  const storage = reconcileSessionStorage();
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (value === null) sessionMemory.delete(key);
      else sessionMemory.set(key, value);
      return value;
    } catch { /* Keep the last known in-memory value while reads are denied. */ }
  }
  return sessionMemory.get(key) ?? null;
}

export function writeSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  sessionMemory.set(key, value);
  pendingSessionStorage.set(key, value);
  reconcileSessionStorage();
}

export function removeSessionStorage(key: string) {
  if (typeof window === "undefined") return;
  sessionMemory.delete(key);
  pendingSessionStorage.set(key, null);
  reconcileSessionStorage();
}

export function clearQrGuitarSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  void invalidateSitePreviewSession().catch(() => undefined);
  removeSessionStorage(sessionStartedAtKey);
  removeSessionStorage(lastActivityAtKey);
  removeSessionStorage(sessionIdentityKey);
  removeSessionStorage("qrguitar.siteEditorUnlocked");
}

export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase browser auth is not configured.");
  }

  browserClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  let previewActor: string | undefined;
  browserClient.auth.onAuthStateChange((event, session) => {
    const next = session?.user.id || "";
    const changed = event === "SIGNED_OUT" || (previewActor !== undefined && next !== previewActor);
    previewActor = next;
    if (changed) void invalidateSitePreviewSession().catch(() => undefined);
  });
  return browserClient;
}

export async function getSupabaseAccessToken() {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}
