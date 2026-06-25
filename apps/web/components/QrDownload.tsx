"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { defaultQrStyle, type QrStyle } from "../lib/local-demo";

type QrDownloadProps = {
  code: string;
  label: string;
  qrStyle?: QrStyle;
  onStyleChange?: (style: QrStyle) => void;
};

const qrPresets: Array<{ label: string; style: Pick<QrStyle, "foreground" | "background" | "shape">; helper: string }> = [
  { label: "White", helper: "Light QR on dark background", style: { foreground: "#f8f6f2", background: "#071014", shape: "classic" } },
  { label: "Transparent", helper: "QR only, no background", style: { foreground: "#071014", background: "transparent", shape: "classic" } },
  { label: "Orange", helper: "QRguitar orange on dark", style: { foreground: "#ffbd55", background: "#071014", shape: "soft" } },
  { label: "Print", helper: "Black QR on white", style: { foreground: "#071014", background: "#f8f6f2", shape: "classic" } }
];

export function QrDownload({ code, label, qrStyle, onStyleChange }: QrDownloadProps) {
  const [dataUrl, setDataUrl] = useState("");
  const [style, setStyle] = useState<QrStyle>(qrStyle ?? defaultQrStyle);
  const [isEditing, setIsEditing] = useState(false);
  const profilePath = `/i/${code}`;
  const isTransparent = style.background === "transparent";
  const incomingStyle = useMemo(
    () => qrStyle ?? defaultQrStyle,
    [qrStyle?.background, qrStyle?.foreground, qrStyle?.includeLabel, qrStyle?.labelText, qrStyle?.shape]
  );
  const profileUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return profilePath;
    }

    return `${window.location.origin}${profilePath}`;
  }, [profilePath]);

  useEffect(() => {
    setStyle((current) => (areQrStylesEqual(current, incomingStyle) ? current : incomingStyle));
  }, [incomingStyle]);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: {
        dark: style.foreground,
        light: isTransparent ? "#ffffff00" : style.background
      }
    })
      .then((url) => renderDownloadImage(url, code, label, style))
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, label, profileUrl, isTransparent, style.background, style.foreground, style.includeLabel, style.labelText, style.shape]);

  function updateStyle(next: Partial<QrStyle>) {
    setStyle((current) => {
      const updated = { ...current, ...next };
      if (areQrStylesEqual(current, updated)) {
        return current;
      }

      onStyleChange?.(updated);
      return updated;
    });
  }

  return (
    <div className={`${isEditing ? "qr-download editing" : "qr-download"} ${isTransparent ? "transparent" : ""}`}>
      <div className="qr-summary">
        <div className="qr-art" aria-hidden="true">
          {dataUrl ? <img src={dataUrl} alt="" /> : <span>QR</span>}
        </div>
        <div>
          <strong>{code}</strong>
          <span>{label}</span>
        </div>
      </div>

      <div className="qr-primary-actions">
        {dataUrl ? (
          <a className="button secondary qr-download-button" href={dataUrl} download={`qrguitar-${code}.png`}>
            Download
          </a>
        ) : (
          <button className="button secondary qr-download-button" type="button" disabled>
            Preparing
          </button>
        )}
        <button className="button secondary qr-edit-button" type="button" onClick={() => setIsEditing((current) => !current)}>
          {isEditing ? "Close" : "Customize QR"}
        </button>
      </div>

        {isEditing ? (
        <div className="qr-editor-panel">
          <div className="qr-preset-row" aria-label="QR appearance presets">
            {qrPresets.map((preset) => {
              const isActive = isQrStyleMatch(preset.style, style);

              return (
                <button
                  className={`qr-preset ${isActive ? "selected" : ""}`}
                  type="button"
                  key={preset.label}
                  aria-pressed={isActive}
                  onClick={() => updateStyle(preset.style)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.helper}</span>
                </button>
              );
            })}
          </div>
          <div className="qr-mini-controls" aria-label="Custom QR colors">
            <label>
              QR Color
              <input
                type="color"
                value={style.foreground}
                onChange={(event) => updateStyle({ foreground: event.target.value })}
                aria-label="QR module color"
              />
            </label>
            {!isTransparent ? (
              <label>
                Background
                <input
                  type="color"
                  value={style.background}
                  onChange={(event) => updateStyle({ background: event.target.value })}
                  aria-label="QR background color"
                />
              </label>
            ) : null}
          </div>
          {!isTransparent ? (
            <label className="qr-toggle">
              <input
                type="checkbox"
                checked={style.includeLabel}
                onChange={(event) => updateStyle({ includeLabel: event.target.checked })}
              />
              Include instrument label under QR
            </label>
          ) : (
            <p className="qr-note">Transparent export downloads the QR only: no background, border, label, or QRguitar branding.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function areQrStylesEqual(first: QrStyle, second: QrStyle) {
  return (
    first.foreground === second.foreground &&
    first.background === second.background &&
    first.includeLabel === second.includeLabel &&
    first.labelText === second.labelText &&
    first.shape === second.shape
  );
}

function isQrStyleMatch(presetStyle: Pick<QrStyle, "foreground" | "background" | "shape">, style: QrStyle) {
  return presetStyle.foreground === style.foreground && presetStyle.background === style.background && presetStyle.shape === style.shape;
}

function renderDownloadImage(qrUrl: string, code: string, label: string, style: QrStyle) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const isTransparent = style.background === "transparent";

    image.onload = () => {
      const qrSize = isTransparent ? 1024 : 900;
      const padding = isTransparent ? 0 : 90;
      const labelHeight = !isTransparent && style.includeLabel ? 150 : 0;
      const canvas = document.createElement("canvas");
      canvas.width = isTransparent ? qrSize : qrSize + padding * 2;
      canvas.height = isTransparent ? qrSize : qrSize + padding * 2 + labelHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Could not render QR image."));
        return;
      }

      if (!isTransparent) {
        context.fillStyle = style.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      context.drawImage(image, padding, padding, qrSize, qrSize);

      if (!isTransparent && style.includeLabel) {
        const labelY = padding + qrSize + 56;
        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        context.fillStyle = style.foreground;
        context.font = "900 42px Arial, sans-serif";
        context.fillText(code, canvas.width / 2, labelY);
        context.font = "700 28px Arial, sans-serif";
        context.fillText(style.labelText || label, canvas.width / 2, labelY + 46);
      }

      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => reject(new Error("Could not load generated QR image."));
    image.src = qrUrl;
  });
}
