import type { CSSProperties } from "react";

type ColorChannels = readonly [number, number, number];

const darkText = "#0b0d0f";
const darkChannels: ColorChannels = [11 / 255, 13 / 255, 15 / 255];
const blackChannels: ColorChannels = [0, 0, 0];
const whiteChannels: ColorChannels = [1, 1, 1];

function luminance(channels: ColorChannels) {
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first: ColorChannels, second: ColorChannels) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function foreground(background: ColorChannels) {
  if (contrast(darkChannels, background) >= 4.5) return darkText;
  return contrast(whiteChannels, background) >= contrast(blackChannels, background)
    ? "#ffffff"
    : "#000000";
}

/** Home uses the configured accent and the shared 82% accent / 18% white hover. */
export function homeActionTextColors(accent: string): CSSProperties {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return {};
  const normal = [1, 3, 5].map((offset) =>
    Number.parseInt(accent.slice(offset, offset + 2), 16) / 255
  ) as unknown as ColorChannels;
  // Retain fractional channels: rounding the hover mix can select the wrong text.
  const hover = normal.map((value) => value * 0.82 + 0.18) as unknown as ColorChannels;
  return {
    "--home-on-action": foreground(normal),
    "--home-on-action-hover": foreground(hover)
  } as CSSProperties;
}
