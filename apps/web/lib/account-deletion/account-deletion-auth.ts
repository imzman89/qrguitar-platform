import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { IntakeAuth } from "./deletion-intake-client";

// Pass this module-level function to AccountDeletionSection. Its stable identity
// prevents unrelated parent renders from restarting the controller's auth work.
// Server auth.getUser remains responsible for verifying the bearer identity.
export function accountDeletionAuth(): IntakeAuth {
  return createBrowserSupabaseClient().auth;
}
