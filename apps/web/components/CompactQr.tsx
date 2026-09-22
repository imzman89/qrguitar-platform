"use client";
import { useUiText } from "./UiTextProvider";


import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { publicProfileUrl } from "../lib/profile-url";
import { beginQrRender, qrRenderOptions } from "../lib/qr-output";
import { FallbackImage } from "./FallbackImage";

export function CompactQr({ code, label }: { code: string; label: string }) {
  const ui = useUiText("components.CompactQr");
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
      alt={ui("ui.components.CompactQr.817fa9875e3c", "QR code for {{value1}}", { value1: label })}
      width={240}
      height={240}
      loading="lazy"
      fetchPriority="low"
      decoding="async"
      referrerPolicy="no-referrer"
      fallback={<span aria-label={ui("ui.components.CompactQr.e13ef7af75b3", "QR preview unavailable; use the Profile link")}>{ui("ui.components.CompactQr.a439fba430a3", "QR")}</span>}
    />
  ) : <span aria-label={fallbackLabel}>{ui("ui.components.CompactQr.a439fba430a3", "QR")}</span>;
}
