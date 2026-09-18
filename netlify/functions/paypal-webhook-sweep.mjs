const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{32,256}$/;

export const PAYPAL_SWEEP_SCHEDULE = "*/5 * * * *";
export const PAYPAL_SWEEP_TIMEOUT_MS = 15_000;
export const PAYPAL_SWEEP_MAX_RESPONSE_BYTES = 1_024;
export const PAYPAL_SWEEP_URL =
  "https://www.qrguitar.com/api/internal/paypal-webhook-sweep";

export const config = {
  // Keep this literal so Netlify's static function-config parser records it.
  schedule: "*/5 * * * *"
};

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8;
}

function validSweepResult(value) {
  const keys = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  const expectedKeys = ["applied", "claimed", "completed", "deadlineReached", "ok", "quarantined"];
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      keys.length === expectedKeys.length &&
      keys.every((key, index) => key === expectedKeys[index]) &&
      value.ok === true &&
      validCount(value.claimed) &&
      validCount(value.applied) &&
      validCount(value.completed) &&
      validCount(value.quarantined) &&
      typeof value.deadlineReached === "boolean"
  );
}

async function readBoundedResponseText(response) {
  const declaredLength = response.headers?.get?.("content-length");
  if (declaredLength !== null && declaredLength !== undefined) {
    const bytes = /^\d+$/.test(declaredLength) ? Number(declaredLength) : Number.NaN;
    if (!Number.isSafeInteger(bytes) || bytes > PAYPAL_SWEEP_MAX_RESPONSE_BYTES) {
      try { await response.body?.cancel(); } catch {}
      throw new Error("invalid response length");
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("missing response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (!chunk || typeof chunk.done !== "boolean") throw new Error("invalid response stream");
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new Error("invalid response chunk");
      bytesRead += chunk.value.byteLength;
      if (bytesRead > PAYPAL_SWEEP_MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error("response too large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function stop(logger, message) {
  logger.error(message);
  throw new Error(message);
}

export async function runPayPalWebhookSweepSchedule({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const secret = environment.CRON_SECRET;
  if (typeof secret !== "string" || !SECRET_PATTERN.test(secret)) {
    stop(logger, "PayPal webhook sweep schedule failed: CRON_SECRET is missing or invalid.");
  }

  let response;
  try {
    response = await fetchImpl(PAYPAL_SWEEP_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(PAYPAL_SWEEP_TIMEOUT_MS)
    });
  } catch {
    stop(logger, "PayPal webhook sweep schedule failed: the authenticated request did not complete.");
  }

  if (!response || typeof response.ok !== "boolean") {
    stop(logger, "PayPal webhook sweep schedule failed: the endpoint returned an invalid response.");
  }
  if (!response.ok) {
    const status = Number.isInteger(response.status) ? response.status : 0;
    stop(logger, `PayPal webhook sweep schedule failed: endpoint HTTP ${status}.`);
  }

  let result;
  try {
    result = JSON.parse(await readBoundedResponseText(response));
  } catch {
    stop(logger, "PayPal webhook sweep schedule failed: the endpoint returned an invalid or oversized response.");
  }
  if (!validSweepResult(result)) {
    stop(logger, "PayPal webhook sweep schedule failed: the endpoint result was invalid.");
  }

  logger.info("PayPal webhook sweep schedule completed successfully.");
  return result;
}

export default async function paypalWebhookSweepSchedule() {
  await runPayPalWebhookSweepSchedule();
}
