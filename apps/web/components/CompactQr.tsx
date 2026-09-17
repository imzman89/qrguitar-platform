"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { publicProfileUrl } from "../lib/profile-url";
import { beginQrRender, qrRenderOptions } from "../lib/qr-output";

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

  return source ? <img src={source} alt={`QR code for ${label}`} /> : <span aria-label={rendered.code === code && rendered.error ? "QR preview unavailable; use the Profile link" : "Preparing QR preview"}>QR</span>;
}
