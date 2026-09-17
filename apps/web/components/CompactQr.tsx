"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { publicProfileUrl } from "../lib/profile-url";

export function CompactQr({ code, label }: { code: string; label: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let active = true;
    const url = publicProfileUrl(code);
    void QRCode.toDataURL(url, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#f8f6f2", light: "#081014" }
    }).then((nextSource) => {
      if (active) setSource(nextSource);
    });
    return () => { active = false; };
  }, [code]);

  return source ? <img src={source} alt={`QR code for ${label}`} /> : <span aria-hidden="true">QR</span>;
}
