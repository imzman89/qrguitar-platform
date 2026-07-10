export function qrCodeFromSerial(serialNumber: string) {
  const normalizedSerial = String(serialNumber || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^QRG-/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return normalizedSerial ? `QRG-${normalizedSerial}` : "";
}
