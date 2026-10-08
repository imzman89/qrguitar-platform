import type { DemoInstrument } from "./local-demo";

type HandoutPayload = { ok?: boolean; instrument?: DemoInstrument; message?: string };
export type HandoutProfile = { instrument: DemoInstrument; ownerAuthorized: boolean };
export class HandoutLoadError extends Error {
  constructor(message = "The Profile could not be loaded. Please try again.") {
    super(message);
    this.name = "HandoutLoadError";
  }
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("The request was cancelled.", "AbortError"));
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Owner outages must not silently replace private print data with a public response. */
export async function loadHandoutInstrument({
  code, readToken, fetchProfile = fetch, signal, timeoutMs = 20000, tokenTimeoutMs = 2500
}: {
  code: string;
  readToken: () => Promise<string>;
  fetchProfile?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  tokenTimeoutMs?: number;
}): Promise<HandoutProfile> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let tokenTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async (): Promise<HandoutProfile> => {
      controller.signal.throwIfAborted();
      const token = await Promise.race([
        Promise.resolve().then(readToken).catch(() => ""),
        new Promise<string>((resolve) => { tokenTimeout = setTimeout(() => resolve(""), tokenTimeoutMs); })
      ]);
      if (tokenTimeout) clearTimeout(tokenTimeout);
      controller.signal.throwIfAborted();
      const request = async (owner: boolean) => {
        const response = await fetchProfile(`/api/instruments?${owner ? "scope=mine&" : ""}code=${encodeURIComponent(code)}`, {
          cache: "no-store", signal: controller.signal,
          headers: { "Cache-Control": "no-cache", ...(owner ? { authorization: `Bearer ${token}` } : {}) }
        });
        const payload = await response.json().catch(() => null) as HandoutPayload | null;
        return { response, payload };
      };
      if (token) {
        const { response, payload } = await request(true);
        if (response.ok && payload?.ok && payload.instrument) return { instrument: payload.instrument, ownerAuthorized: true };
        if (![401, 403, 404].includes(response.status)) {
          throw new HandoutLoadError("Your Profile could not be loaded. Please try again before printing.");
        }
      }
      controller.signal.throwIfAborted();
      const { response, payload } = await request(false);
      if (response.ok && payload?.ok && payload.instrument) return { instrument: payload.instrument, ownerAuthorized: false };
      if (response.status === 404 || response.status === 403) {
        throw new HandoutLoadError(payload?.message || "This Profile is unavailable or requires its owner account to print.");
      }
      throw new HandoutLoadError();
    };
    return await abortable(work(), controller.signal);
  } catch (error) {
    if (timedOut) throw new HandoutLoadError("Loading took too long. Please try again.");
    if (signal?.aborted) throw error;
    if (error instanceof HandoutLoadError) throw error;
    throw new HandoutLoadError("Could not connect to QRguitar. Please try again.");
  } finally {
    clearTimeout(timeout);
    if (tokenTimeout) clearTimeout(tokenTimeout);
    signal?.removeEventListener("abort", cancel);
  }
}
