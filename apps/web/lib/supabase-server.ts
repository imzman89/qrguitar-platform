import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;
const SUPABASE_FETCH_TIMEOUT_MS = 15000;

let localEnvLoaded = false;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = SUPABASE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      cache: init?.cache || "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnvIfNeeded() {
  if (localEnvLoaded || process.env.NODE_ENV === "production") {
    return;
  }

  localEnvLoaded = true;
  const cwd = process.cwd();

  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, "..", "..", ".env.local"));
}

export function getSupabaseEnvStatus() {
  loadLocalEnvIfNeeded();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const missing = REQUIRED_SUPABASE_ENV_KEYS.filter((key) => {
    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      return !supabaseUrl;
    }

    if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
      return !anonKey;
    }

    return !process.env[key];
  });

  return {
    isConfigured: Boolean(supabaseUrl && serviceRoleKey),
    missing,
    supabaseUrl,
    hasAnonKey: Boolean(anonKey),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    siteUrl
  };
}

export function createServerSupabaseClient() {
  return createServerSupabaseClientWithTimeout(SUPABASE_FETCH_TIMEOUT_MS);
}

export function createServerSupabaseClientWithTimeout(timeoutMs: number) {
  const status = getSupabaseEnvStatus();

  if (!status.supabaseUrl || !status.hasServiceRoleKey) {
    return null;
  }

  return createClient(status.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init, timeoutMs)
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createPublicSupabaseClient() {
  return createPublicSupabaseClientWithTimeout(SUPABASE_FETCH_TIMEOUT_MS);
}

export function createPublicSupabaseClientWithTimeout(timeoutMs: number) {
  const status = getSupabaseEnvStatus();

  if (!status.supabaseUrl || !status.hasAnonKey) {
    return null;
  }

  return createClient(status.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init, timeoutMs)
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return "";
  }

  return token.trim();
}

export async function getAuthenticatedUser(request: Request) {
  const supabase = createServerSupabaseClient();
  const token = getBearerToken(request);

  if (!supabase || !token) {
    return { user: null, error: token ? "Supabase is not configured." : "Sign in required." };
  }

  const result = await supabase.auth.getUser(token);
  if (result.error || !result.data.user) {
    return { user: null, error: "Your session expired. Sign in again." };
  }

  return { user: result.data.user, error: "" };
}
