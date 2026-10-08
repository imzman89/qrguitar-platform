import QRCode from "qrcode";
import { publicProfileUrl } from "./profile-url";
import { qrRenderOptions } from "./qr-output";

export const qrPrintColors = { foreground: "#000000", background: "#ffffff" };

export function qrPrintMetrics(code: string, sideMm: number) {
  if (![25, 32, 38, 38.1].includes(sideMm)) throw new Error("Choose a supported QR size.");
  const profileUrl = publicProfileUrl(code);
  const modules = QRCode.create(profileUrl, { errorCorrectionLevel: "H" }).modules.size;
  const totalModules = modules + 8;
  // Round up to whole pixels per module at at least 300 pixels/inch.
  const scale = Math.ceil((sideMm / 25.4 * 300) / totalModules);
  return { profileUrl, sideMm, modules, totalModules, scale, pixelWidth: totalModules * scale, moduleMm: sideMm / totalModules };
}

export async function printQrSvg(code: string, sideMm = 32) {
  const metrics = qrPrintMetrics(code, sideMm);
  const svg = await QRCode.toString(metrics.profileUrl, { ...qrRenderOptions(qrPrintColors), type: "svg" });
  // qrcode owns the paths/viewBox; only the outer physical dimensions change.
  return svg.replace('width="720" height="720"', `width="${sideMm}mm" height="${sideMm}mm"`);
}

export async function printQrPng(code: string, sideMm: number) {
  const metrics = qrPrintMetrics(code, sideMm);
  return QRCode.toDataURL(metrics.profileUrl, qrRenderOptions(qrPrintColors, metrics.pixelWidth));
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
