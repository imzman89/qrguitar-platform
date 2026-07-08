"use client";

import { Download, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { defaultQrStyle, type QrStyle } from "../lib/local-demo";

type QrDownloadProps = {
  code: string;
  label: string;
  qrStyle?: QrStyle;
  onStyleChange?: (style: QrStyle) => void;
  handout?: {
    photoUrl?: string;
    brand?: string;
    model?: string;
    year?: string;
    location?: string;
    serial?: string;
    showSerial?: boolean;
    verification?: string;
    authenticity?: string;
    safety?: string;
  };
};

type LabelLines = {
  firstLine: string[];
  remainingLines: string[];
};

const qrPresets: Array<{ label: string; style: Pick<QrStyle, "foreground" | "background" | "shape">; helper: string }> = [
  { label: "White", helper: "Light QR on dark background", style: { foreground: "#f8f6f2", background: "#071014", shape: "classic" } },
  { label: "Transparent", helper: "QR only, no background", style: { foreground: "#071014", background: "transparent", shape: "classic" } },
  { label: "Orange", helper: "QRguitar orange on dark", style: { foreground: "#ffbd55", background: "#071014", shape: "soft" } },
  { label: "Print", helper: "Black QR on white", style: { foreground: "#071014", background: "#f8f6f2", shape: "classic" } }
];

export function QrDownload({ code, label, qrStyle, onStyleChange, handout }: QrDownloadProps) {
  const [dataUrl, setDataUrl] = useState("");
  const [style, setStyle] = useState<QrStyle>(qrStyle ?? defaultQrStyle);
  const [labelInput, setLabelInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
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

  const fallbackLabelText = useMemo(() => {
    const trimmed = label?.trim();
    return trimmed ? `${code}\n${trimmed}` : `${code}\nInstrument`;
  }, [code, label]);

  useEffect(() => {
    const nextValue = style.labelText?.trim() ? style.labelText : fallbackLabelText;
    setLabelInput(nextValue);
  }, [fallbackLabelText, style.labelText]);

  const displayLabel = useMemo(() => labelInput.trim() || fallbackLabelText, [labelInput, fallbackLabelText]);

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
      .then((url) => renderDownloadImage(url, code, displayLabel, style))
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [displayLabel, profileUrl, isTransparent, style.background, style.foreground, style.includeLabel, style.shape]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLightboxOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

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

  function handleLabelChange(nextLabel: string) {
    setLabelInput(nextLabel);
    updateStyle({ labelText: nextLabel });
  }

  function printHandout() {
    if (!dataUrl || typeof window === "undefined") {
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=760,height=920");
    if (!printWindow) {
      window.print();
      return;
    }

    const safeTitle = escapeHtml(label || "QRguitar Profile");
    const safeCode = escapeHtml(code);
    const safeUrl = escapeHtml(profileUrl);
    const safeQr = escapeHtml(dataUrl);
    const safePhoto = handout?.photoUrl ? escapeHtml(handout.photoUrl) : "";
    const facts = [
      handout?.brand,
      handout?.model,
      handout?.year,
      handout?.location
    ].map((item) => String(item || "").trim()).filter(Boolean);
    const badges = [
      handout?.verification,
      handout?.authenticity,
      handout?.safety
    ].map((item) => String(item || "").trim()).filter(Boolean);
    const safeFacts = facts.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    const safeBadges = badges.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    const safeSerial = handout?.showSerial && handout.serial ? escapeHtml(handout.serial) : "";

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QRguitar handout - ${safeCode}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f5f0df;
      color: #071014;
      font-family: Arial, Helvetica, sans-serif;
    }
    .handout {
      width: min(760px, calc(100vw - 28px));
      border: 1px solid #d2b169;
      border-radius: 22px;
      overflow: hidden;
      background: #071014;
      color: #f8f6f2;
      box-shadow: 0 28px 80px rgba(7, 16, 20, .28);
    }
    .brand {
      padding: 26px 30px 0;
      font-size: 30px;
      font-weight: 950;
      letter-spacing: -.02em;
    }
    .brand span { color: #f0a12b; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(260px, .95fr);
      gap: 0;
      padding: 22px 30px 30px;
    }
    .photo {
      min-height: 330px;
      border: 1px solid rgba(248, 246, 242, .16);
      border-radius: 18px 0 0 18px;
      overflow: hidden;
      background: #11191e;
    }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo.empty {
      display: grid;
      place-items: center;
      color: #d2b169;
      font-weight: 900;
    }
    .info {
      min-height: 330px;
      border: 1px solid rgba(248, 246, 242, .16);
      border-left: 0;
      border-radius: 0 18px 18px 0;
      padding: 28px;
      display: grid;
      align-content: center;
      gap: 18px;
      background: linear-gradient(180deg, rgba(248,246,242,.06), rgba(248,246,242,.015)), #121b20;
    }
    h1 {
      margin: 0;
      font-size: 42px;
      line-height: 1.03;
      letter-spacing: -.03em;
    }
    .code {
      margin: 0;
      color: #f0a12b;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: .02em;
    }
    .facts, .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .facts span, .badges span {
      border: 1px solid rgba(248, 246, 242, .18);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 12px;
      font-weight: 850;
      color: #efe6ce;
      background: rgba(248, 246, 242, .04);
    }
    .content {
      display: grid;
      grid-template-columns: 210px 1fr;
      gap: 28px;
      align-items: center;
      margin: 0 30px 30px;
      padding: 22px;
      border: 1px solid rgba(248, 246, 242, .13);
      border-radius: 18px;
      background: #f8f6f2;
      color: #071014;
    }
    .qr {
      width: 210px;
      border: 1px solid #e5d9b8;
      border-radius: 14px;
      padding: 12px;
      background: #071014;
    }
    .qr img { width: 100%; display: block; }
    .copy {
      display: grid;
      gap: 12px;
      font-size: 18px;
      line-height: 1.45;
    }
    .copy strong { font-size: 20px; }
    .url {
      overflow-wrap: anywhere;
      border: 1px solid #e5d9b8;
      border-radius: 12px;
      padding: 12px;
      background: #f7efd7;
      font-size: 14px;
      font-weight: 800;
    }
    .footer {
      margin: 0;
      padding: 0 30px 28px;
      color: rgba(248, 246, 242, .68);
      font-size: 13px;
      line-height: 1.45;
    }
    @media print {
      body { background: white; }
      .handout { width: 100%; box-shadow: none; }
    }
    @media (max-width: 620px) {
      .hero, .content { grid-template-columns: 1fr; }
      .photo, .info { border-radius: 16px; border: 1px solid rgba(248, 246, 242, .16); }
      .info { border-top: 0; }
      .qr { width: 100%; max-width: 260px; }
    }
  </style>
</head>
<body>
  <main class="handout">
    <div class="brand">QR<span>guitar</span></div>
    <section class="hero">
      <div class="photo ${safePhoto ? "" : "empty"}">${safePhoto ? `<img src="${safePhoto}" alt="${safeTitle} photo" />` : "QRguitar Profile"}</div>
      <div class="info">
        <p class="code">${safeCode}</p>
        <h1>${safeTitle}</h1>
        ${safeFacts ? `<div class="facts">${safeFacts}</div>` : ""}
        ${safeSerial ? `<div class="facts"><span>Serial / Build ID: ${safeSerial}</span></div>` : ""}
        ${safeBadges ? `<div class="badges">${safeBadges}</div>` : ""}
      </div>
    </section>
    <section class="content">
      <div class="qr"><img src="${safeQr}" alt="QR code for ${safeTitle}" /></div>
      <div class="copy">
        <strong>Scan to open this QRguitar Profile.</strong>
        <span>This QR code stays tied to the instrument profile, photos, specs, service notes, and ownership tools.</span>
        <div class="url">${safeUrl}</div>
      </div>
    </section>
    <p class="footer">If this instrument was serviced or sold with this handout, keep this page with the instrument paperwork. Ownership transfer and claim tools may require the current owner to start the handoff.</p>
  </main>
  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
    printWindow.document.close();
  }

  return (
    <div
      className={`${isEditing ? "qr-download editing" : "qr-download"} ${isTransparent ? "transparent" : ""} ${style.includeLabel ? "has-label" : ""}`}
    >
      <div className="qr-summary">
        <button
          className="qr-art"
          type="button"
          onClick={() => {
            if (dataUrl) {
              setIsLightboxOpen(true);
            }
          }}
          aria-label="Open large QR preview"
          disabled={!dataUrl}
        >
          {dataUrl ? <img src={dataUrl} alt="" /> : <span>QR</span>}
        </button>
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
        <button className="button secondary qr-handout-button" type="button" onClick={printHandout} disabled={!dataUrl}>
          Print Handout
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
            <>
              <label className="qr-label-control">
                QR label text
                <textarea
                  rows={2}
                  value={labelInput}
                  maxLength={140}
                  onChange={(event) => handleLabelChange(event.target.value)}
                  placeholder={fallbackLabelText}
                />
                <p className="qr-helper-text">This text appears under the QR when label is enabled.</p>
              </label>
              <label className="qr-toggle">
                <input
                  type="checkbox"
                  checked={style.includeLabel}
                  onChange={(event) => updateStyle({ includeLabel: event.target.checked })}
                />
                Include instrument label under QR
              </label>
            </>
          ) : (
            <p className="qr-note">Transparent export downloads the QR only: no background, border, label, or QRguitar branding.</p>
          )}
        </div>
      ) : null}

      {isLightboxOpen && dataUrl ? (
        <div className="media-overlay-backdrop" onClick={() => setIsLightboxOpen(false)} role="presentation">
          <div className="media-overlay-content qr-lightbox" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="QR preview">
            <div className="qr-lightbox-header">
              <strong>QR Preview</strong>
              <button className="media-overlay-close qr-lightbox-close" type="button" onClick={() => setIsLightboxOpen(false)} aria-label="Close QR preview">
                <X size={14} />
                <span>Close</span>
              </button>
            </div>
            <div className="qr-lightbox-body">
              <div className={`qr-lightbox-frame ${isTransparent ? "transparent" : ""}`}>
                <img className="qr-lightbox-image" src={dataUrl} alt="QR code preview" />
              </div>
            </div>
            <div className="qr-lightbox-footer">
              <a className="button qr-lightbox-download" href={dataUrl} download={`qrguitar-${code}.png`}>
                <Download size={15} />
                Download PNG
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      const canvasWidth = isTransparent ? qrSize : qrSize + padding * 2;
      const maxTextWidth = isTransparent ? qrSize : canvasWidth - padding * 2 - 20;
      const labelBlockHeight = style.includeLabel ? getLabelBlockHeight(label, code, maxTextWidth) : 0;
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = isTransparent ? qrSize : qrSize + padding * 2 + labelBlockHeight;
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
        const labelLines = wrapText(context, label, code, maxTextWidth);
        const codeFont = "900 42px Arial, sans-serif";
        const labelFont = "700 28px Arial, sans-serif";
        const codeLineHeight = 48;
        const labelLineHeight = 33;
        const gap = Math.max(16, 0.02 * canvas.width);
        const labelY = padding + qrSize + 44;
        let cursorY = labelY;

        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        context.fillStyle = style.foreground;
        context.font = codeFont;

        for (const line of labelLines.firstLine) {
          context.fillText(line, canvas.width / 2, cursorY);
          cursorY += codeLineHeight;
        }

        context.font = labelFont;
        cursorY += gap;

        for (const line of labelLines.remainingLines) {
          context.fillText(line, canvas.width / 2, cursorY);
          cursorY += labelLineHeight;
        }
      }

      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => reject(new Error("Could not load generated QR image."));
    image.src = qrUrl;
  });
}

function getLabelBlockHeight(label: string, code: string, maxTextWidth: number) {
  const testCanvas = document.createElement("canvas");
  const context = testCanvas.getContext("2d");

  if (!context) {
    return 180;
  }

  const lines = wrapText(context, label, code, maxTextWidth);
  const codeLineCount = lines.firstLine.length || 1;
  const labelLineCount = lines.remainingLines.length || 1;
  const codeLineHeight = 48;
  const labelLineHeight = 33;
  const gap = Math.max(16, 0.02 * (maxTextWidth + 160));

  return 28 + codeLineCount * codeLineHeight + gap + labelLineCount * labelLineHeight + 24;
}

function countWrapLines(text: string, font: string, maxWidthPx: number, maxLines = 4) {
  const words = String(text || "")
    .replace(/\r?\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) {
    return 1;
  }

  const testCanvas = document.createElement("canvas");
  const ctx = testCanvas.getContext("2d");
  if (!ctx) {
    return 1;
  }
  ctx.font = font;

  let lines = 0;
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidthPx && currentLine) {
      lines += 1;
      currentLine = word;
      continue;
    }

    currentLine = testLine;
  }

  if (currentLine) {
    lines += 1;
  }

  return Math.max(1, Math.min(lines, maxLines));
}

function wrapText(context: CanvasRenderingContext2D, label: string, code: string, maxWidth: number): LabelLines {
  const labelWords = String(label || "")
    .replace(/\r?\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const codeLines = wordsWrap(context, [String(code || "").trim()], maxWidth, "900 42px Arial, sans-serif", 1);
  const labelLines = wordsWrap(context, labelWords, maxWidth, "700 28px Arial, sans-serif", 2);

  return { firstLine: codeLines, remainingLines: labelLines };
}

function wordsWrap(
  context: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
  font: string,
  maxLines = 4
): string[] {
  const lines: string[] = [];
  context.font = font;
  let currentLine = "";

  for (const rawWord of words) {
    const testLine = currentLine ? `${currentLine} ${rawWord}` : rawWord;
    if (context.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = rawWord;
      continue;
    }

    currentLine = testLine;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (!lines.length) {
    return ["--"];
  }

  return lines.slice(0, maxLines);
}
