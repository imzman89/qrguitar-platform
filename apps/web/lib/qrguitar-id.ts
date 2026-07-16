import { normalizeSerialBuildId } from "./instrument-profile-contract";

export function qrCodeFromSerial(serialNumber: string) {
  const normalizedSerial = normalizeSerialBuildId(serialNumber).slice(0, 64);

  return normalizedSerial ? `QRG-${normalizedSerial}` : "";
}

// Preview-only placeholder. The API is the authority that assigns and reserves a real QRguitar ID.
export function makePreviewQrCode() {
  const bytes = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 1_000_000);
  }

  return `QRG-${String(bytes[0] % 1_000_000).padStart(6, "0")}`;
}
