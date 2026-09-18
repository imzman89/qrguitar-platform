"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { publicProfileUrl } from "../lib/profile-url";
import { beginQrRender, qrRenderOptions } from "../lib/qr-output";
import { FallbackImage } from "./FallbackImage";

export function CompactQr({ code, label }: { code: string; label: string }) {
  const [rendered, setRendered] = useState({ code: "", url: "", error: "" });
  const source = rendered.code === code ? rendered.url : "";

  useEffect(() => {
    const url = publicProfileUrl(code);
    return beginQrRender(
      () => QRCode.toDataURL(url, qrRenderOptions({ foreground: "#081014", background: "#ffffff" }, 240)),
      result => setRendered({ code, ...result })
    );
  }, [code]);

  const fallbackLabel = rendered.code === code && rendered.error ? "QR preview unavailable; use the Profile link" : "Preparing QR preview";

  return source ? (
    <FallbackImage
      src={source}
      alt={`QR code for ${label}`}
      width={240}
      height={240}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      referrerPolicy="no-referrer"
      fallback={<span aria-label="QR preview unavailable; use the Profile link">QR</span>}
    />
  ) : <span aria-label={fallbackLabel}>QR</span>;
}
