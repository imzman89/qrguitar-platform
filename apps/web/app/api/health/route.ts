import { NextResponse } from "next/server";
import { createServerSupabaseClientWithTimeout } from "../../../lib/supabase-server";
import { isReleaseReady, RELEASE_VERSION } from "../../../lib/release-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;
function status(ready: boolean) {
  return NextResponse.json({ status: ready ? "ready" : "unavailable", releaseVersion: RELEASE_VERSION }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", ...(ready ? {} : { "Retry-After": "30" }) }
  });
}
// This public probe exposes no schema details, account data, or service credentials.
export async function GET() {
  try {
    const supabase = createServerSupabaseClientWithTimeout(8000);
    if (!supabase) return status(false);
    const result = await supabase.rpc("qrguitar_release_readiness", {}, { get: true }).abortSignal(AbortSignal.timeout(8000));
    return status(!result.error && isReleaseReady(result.data));
  } catch { return status(false); }
}
