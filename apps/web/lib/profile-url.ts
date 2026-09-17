export const PUBLIC_SITE_ORIGIN = "https://www.qrguitar.com";

export function publicProfileUrl(code: string) {
  return `${PUBLIC_SITE_ORIGIN}/i/${encodeURIComponent(code)}`;
}
