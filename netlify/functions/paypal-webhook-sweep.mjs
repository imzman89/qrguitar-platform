const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{32,256}$/;

export const PAYPAL_SWEEP_SCHEDULE = "*/5 * * * *";
export const PAYPAL_SWEEP_TIMEOUT_MS = 15_000;
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
  return Boolean(
    value &&
      typeof value === "object" &&
      value.ok === true &&
      validCount(value.claimed) &&
      validCount(value.applied) &&
      validCount(value.completed) &&
      validCount(value.quarantined) &&
      typeof value.deadlineReached === "boolean"
  );
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
    result = await response.json();
  } catch {
    stop(logger, "PayPal webhook sweep schedule failed: the endpoint returned invalid JSON.");
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
