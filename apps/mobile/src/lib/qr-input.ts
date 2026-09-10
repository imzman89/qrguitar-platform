/** Extract only a QRguitar Profile identity; never navigate to a scanned URL. */
const CODE = /^QRG-[A-Z0-9]{1,64}$/i;
export function parseQrInput(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))
    return null;
  if (CODE.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return null;
    let path = url.pathname;
    if (url.protocol === "qrguitar:") {
      if (url.hostname === "i") path = "/i" + path;
      else if (url.hostname) return null;
    } else if (
      !["https:", "http:"].includes(url.protocol) ||
      !["qrguitar.com", "www.qrguitar.com"].includes(url.hostname)
    )
      return null;
    const match = /^\/i\/([^/]+)\/?$/.exec(path);
    if (!match) return null;
    const code = decodeURIComponent(match[1]);
    return CODE.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}
export function profileWebUrl(code: string, owner = false): string {
  const normalized = parseQrInput(code);
  if (!normalized || !CODE.test(code)) throw new Error("Invalid QRguitar ID.");
  return (
    "https://qrguitar.com/" + (owner ? "dashboard/profile/" : "i/") + normalized
  );
}
export function publicSearchText(
  record: {
    qrCode: string;
    name: string;
    brand: string;
    model?: string;
    year?: string;
    location?: string;
  },
  query: string,
) {
  return [
    record.qrCode,
    record.name,
    record.brand,
    record.model,
    record.year,
    record.location,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}
