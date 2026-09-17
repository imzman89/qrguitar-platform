import type { QRCodeToDataURLOptions } from "qrcode";

type QrColors = { foreground: string; background: string };

function luminance(hex: string) {
  const values = hex.slice(1).match(/../g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

export function qrColorError(colors: QrColors): string {
  if (!/^#[0-9a-f]{6}$/i.test(colors.foreground) ||
      (colors.background !== "transparent" && !/^#[0-9a-f]{6}$/i.test(colors.background))) {
    return "These QR colors are invalid. Choose an appearance preset to continue.";
  }
  if (colors.background === "transparent") return "";
  const first = luminance(colors.foreground);
  const second = luminance(colors.background);
  // A conservative product guard, not a guarantee that every camera can scan it.
  if ((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05) < 4.5) {
    return "These colors have too little contrast. Choose stronger colors or the Print preset.";
  }
  return "";
}

export function qrRenderOptions(colors: QrColors, width = 720): QRCodeToDataURLOptions {
  const error = qrColorError(colors);
  if (error) throw new Error(error);
  return {
    errorCorrectionLevel: "H",
    margin: 4,
    width,
    color: { dark: colors.foreground, light: colors.background === "transparent" ? "#ffffff00" : colors.background }
  };
}

/** One render attempt owns its timeout and cannot publish after cancellation. */
export function beginQrRender(
  render: () => Promise<string>,
  publish: (result: { url: string; error: string }) => void,
  timeoutMs = 12000
) {
  let active = true;
  const timer = setTimeout(() => finish({ url: "", error: "The QR preview took too long. Try preparing it again." }), timeoutMs);
  function finish(result: { url: string; error: string }) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    publish(result);
  }
  void Promise.resolve().then(render).then(
    url => finish({ url, error: "" }),
    () => finish({ url: "", error: "The QR preview could not be prepared. Try again or choose the Print preset." })
  );
  return () => { active = false; clearTimeout(timer); };
}
