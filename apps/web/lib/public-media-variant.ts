export const publicMediaVariantWidths = [160, 640, 1200] as const;
export type PublicMediaVariantWidth = typeof publicMediaVariantWidths[number];

const allowedWidths = new Set<number>(publicMediaVariantWidths);
const publicFileTokenPattern = /^[a-f0-9]{24}$/;

export function publicMediaVariantUrl(source: string, width: PublicMediaVariantWidth) {
  const value = String(source || "").trim();
  if (value !== source || !value.startsWith("/") || value.startsWith("//") || !allowedWidths.has(width)) return source;

  let url: URL;
  try {
    url = new URL(value, "https://qrguitar.invalid");
  } catch {
    return source;
  }

  if (url.origin !== "https://qrguitar.invalid" || url.search || url.hash) return source;
  const segments = url.pathname.split("/");
  if (
    segments.length !== 6 ||
    segments[0] !== "" ||
    segments[1] !== "api" ||
    segments[2] !== "public-file" ||
    !segments[3] ||
    segments[4] !== "media" ||
    !publicFileTokenPattern.test(segments[5])
  ) {
    return source;
  }

  return url.pathname + "?w=" + width + "&format=webp";
}
const defaultResponsiveWidths: readonly PublicMediaVariantWidth[] = [640, 1200];

export function publicMediaVariantSrcSet(
  source: string,
  widths: readonly PublicMediaVariantWidth[] = defaultResponsiveWidths
) {
  const candidates = Array.from(new Set(widths)).sort((first, second) => first - second);
  if (!candidates.length) return undefined;
  const variants = candidates.map((width) => ({ width, url: publicMediaVariantUrl(source, width) }));
  if (variants.some((variant) => variant.url === source)) return undefined;
  return variants.map((variant) => variant.url + " " + variant.width + "w").join(", ");
}
