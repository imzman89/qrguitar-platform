"use client";

import { invalidateSitePreviewSession } from "./site-preview-client";
import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

export const sessionStartedAtKey = "qrguitar.sessionStartedAt";
export const lastActivityAtKey = "qrguitar.lastActivityAt";
export const sessionExpiredMessageKey = "qrguitar.sessionExpiredMessage";

export function clearQrGuitarSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  void invalidateSitePreviewSession().catch(() => undefined);
  window.localStorage.removeItem(sessionStartedAtKey);
  window.localStorage.removeItem(lastActivityAtKey);
  window.localStorage.removeItem("qrguitar.siteEditorUnlocked");
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
