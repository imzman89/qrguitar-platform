type InstrumentValidationInput = {
  brand: string;
  model: string;
  serial: string;
  year: string;
  summary?: string;
};

const recentSubmissions = new Map<string, number[]>();

export function validateInstrumentSubmission(input: InstrumentValidationInput, honeypotValue = "") {
  if (honeypotValue.trim()) {
    return "Submission blocked.";
  }

  const required = [input.brand, input.model, input.serial, input.year].map((value) => value.trim());
  if (required.some((value) => !value)) {
    return "Make, model, serial number, and year are required.";
  }

  if (required.some((value) => value.length > 80) || (input.summary || "").length > 2000) {
    return "One or more fields is too long. Shorten the text and try again.";
  }

  if (!/^[a-zA-Z0-9 .,'&+/_-]+$/.test(input.brand) || !/^[a-zA-Z0-9 .,'&+/_-]+$/.test(input.model)) {
    return "Make and model can only use normal letters, numbers, spaces, and basic punctuation.";
  }

  if (!/^[a-zA-Z0-9._/-]+$/.test(input.serial)) {
    return "Serial number can only use letters, numbers, dots, slashes, dashes, and underscores.";
  }

  if (!/^(19|20)\d{2}$/.test(input.year.trim())) {
    return "Enter a four-digit year.";
  }

  return "";
}

export function createSubmissionFingerprint(input: InstrumentValidationInput) {
  return [input.brand, input.model, input.serial, input.year, input.summary || ""]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}

export function isRepeatedBrowserSubmission(storageKey: string, fingerprint: string, windowRef: Window, minDelayMs = 5000) {
  const previous = windowRef.localStorage.getItem(storageKey);
  const now = Date.now();

  if (previous) {
    try {
      const parsed = JSON.parse(previous) as { fingerprint: string; timestamp: number };
      if (parsed.fingerprint === fingerprint && now - parsed.timestamp < minDelayMs) {
        return true;
      }
    } catch {
      windowRef.localStorage.removeItem(storageKey);
    }
  }

  windowRef.localStorage.setItem(storageKey, JSON.stringify({ fingerprint, timestamp: now }));
  return false;
}

export function checkServerRateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const timestamps = (recentSubmissions.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

  if (timestamps.length >= limit) {
    return false;
  }

  recentSubmissions.set(key, [...timestamps, now]);
  return true;
}
