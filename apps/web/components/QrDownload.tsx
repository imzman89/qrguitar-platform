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

export function QrDownload({ code, label, qrStyle, onStyleChange }: QrDownloadProps) {
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
          <div className="media-overlay-content qr-lightbox" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="media-overlay-close" type="button" onClick={() => setIsLightboxOpen(false)} aria-label="Close QR preview">
              ×
            </button>
            <img className="qr-lightbox-image" src={dataUrl} alt="QR code preview" />
            <a className="button" href={dataUrl} download={`qrguitar-${code}.png`}>
              Download
            </a>
          </div>
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
