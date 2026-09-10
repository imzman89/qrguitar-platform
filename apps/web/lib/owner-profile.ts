import type { DemoInstrument } from "./local-demo";

export function ownerProfileHref(record: Pick<DemoInstrument, "qrCode" | "visibility"> & Partial<Pick<DemoInstrument, "permanentPath">>) {
  return record.visibility === "private"
    ? "/dashboard/profile/" + encodeURIComponent(record.qrCode)
    : record.permanentPath || "/i/" + encodeURIComponent(record.qrCode);
}

export class OwnerProfileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function fetchOwnerProfile(code: string, token: string, signal?: AbortSignal): Promise<DemoInstrument> {
  if (!token) throw new OwnerProfileError(401, "Sign in to open your Profile.");
  const response = await fetch("/api/instruments?scope=mine&code=" + encodeURIComponent(code), {
    cache: "no-store", headers: { authorization: "Bearer " + token }, signal
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; instrument?: DemoInstrument } | null;
  if (response.status === 401) throw new OwnerProfileError(401, "Your session expired. Sign in again.");
  if (response.status === 404 || response.status === 403) throw new OwnerProfileError(404, "This Profile is not available to this account.");
  if (!response.ok || !result?.ok || !result.instrument || typeof result.instrument.qrCode !== "string" || result.instrument.qrCode.toUpperCase() !== code.toUpperCase()) {
    throw new OwnerProfileError(503, "We could not load your Profile. Please try again.");
  }
  return result.instrument;
}

