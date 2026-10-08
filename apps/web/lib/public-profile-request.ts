import type { DemoInstrument } from "./local-demo";
/** Bounds both the public HTTP request and body consumption, without inventing an empty result on failure. */
export async function requestPublicProfiles(): Promise<DemoInstrument[]> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("Public Profile request timed out")); }, 15000); });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetch("/api/instruments", { cache: "no-store", signal: controller.signal, headers: { "Cache-Control": "no-cache" } });
      const payload = await response.json() as { ok?: boolean; instruments?: DemoInstrument[] } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) throw new Error("Public Profiles unavailable");
      return payload.instruments;
    })()]);
  } finally { clearTimeout(timeout!); controller.abort(); }
}
