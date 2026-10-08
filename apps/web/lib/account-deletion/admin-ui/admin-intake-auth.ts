import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { QueueAuth } from "./admin-intake-client";

// Stable dependency: unrelated renders must not restart the private queue lease.
export function adminIntakeAuth(): QueueAuth { return createBrowserSupabaseClient().auth; }
