import { normalizeSerialBuildId } from "./instrument-profile-contract";

export function qrCodeFromSerial(serialNumber: string) {
  const normalizedSerial = normalizeSerialBuildId(serialNumber).slice(0, 64);

  return normalizedSerial ? `QRG-${normalizedSerial}` : "";
}

// Preview-only placeholder. The API is the authority that assigns and reserves a real QRguitar ID.
export function makePreviewQrCode() {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `QRG-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
