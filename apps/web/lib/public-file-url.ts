import { createHash } from "node:crypto";

export type PublicFileKind = "media" | "document";

export function publicFileToken(qrCode: string, kind: PublicFileKind, storagePath: string) {
  return createHash("sha256")
    .update(`${qrCode.trim().toUpperCase()}:${kind}:${storagePath.trim()}`)
    .digest("hex")
    .slice(0, 24);
}

export function publicFileUrl(qrCode: string, kind: PublicFileKind, storagePath: string) {
  const code = qrCode.trim().toUpperCase();
  const path = storagePath.trim();
  if (!code || !path) return "";

  return `/api/public-file/${encodeURIComponent(code)}/${kind}/${publicFileToken(code, kind, path)}`;
}
