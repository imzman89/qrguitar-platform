"use client";
import { useUiText } from "./UiTextProvider";


import { Download, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultQrStyle, type QrStyle } from "../lib/local-demo";
import { publicProfileUrl } from "../lib/profile-url";
import { beginQrRender, qrColorError, qrRenderOptions } from "../lib/qr-output";

type QrDownloadProps = {
  code: string;
  label: string;
  qrStyle?: QrStyle;
  onStyleChange?: (style: QrStyle) => void;
  showPrintHandout?: boolean;
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

export function QrDownload({ code, label, qrStyle, onStyleChange, showPrintHandout = true }: QrDownloadProps) {
  const ui = useUiText("components.QrDownload");
  const [rendered, setRendered] = useState({ key: "", url: "", error: "" });
  const [retry, setRetry] = useState(0);
  const [style, setStyle] = useState<QrStyle>(qrStyle ?? defaultQrStyle);
  const [appliedStyleKey, setAppliedStyleKey] = useState(JSON.stringify(qrStyle ?? defaultQrStyle));
  const [isEditing, setIsEditing] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const previewRef = useRef<HTMLDialogElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const isTransparent = style.background === "transparent";

  const incomingStyle = useMemo(
    () => qrStyle ?? defaultQrStyle,
    [qrStyle]
  );
  const incomingStyleKey = JSON.stringify(incomingStyle);

  const profileUrl = publicProfileUrl(code);

  const fallbackLabelText = useMemo(() => {
    const trimmed = label?.trim();
    return trimmed ? `${code}\n${trimmed}` : `${code}\nInstrument`;
  }, [code, label]);

  const labelInput = style.labelText ?? "";
  const displayLabel = useMemo(() => labelInput.trim() || fallbackLabelText, [labelInput, fallbackLabelText]);
  const renderKey = JSON.stringify([profileUrl, code, displayLabel, style, retry]);
  const colorError = qrColorError(style);
  // Never offer the last instrument/style's download while the next render is pending.
  const styleCurrent = appliedStyleKey === incomingStyleKey;
  const dataUrl = styleCurrent && rendered.key === renderKey && !colorError ? rendered.url : "";
  const renderError = styleCurrent ? colorError || (rendered.key === renderKey ? rendered.error : "") : "";
  const previewVisible = isLightboxOpen && Boolean(dataUrl);

  useEffect(() => {
    setStyle((current) => (areQrStylesEqual(current, incomingStyle) ? current : incomingStyle));
    setAppliedStyleKey(incomingStyleKey);
  }, [incomingStyle, incomingStyleKey]);

  useEffect(() => {
    if (colorError || !styleCurrent) return;
    return beginQrRender(
      async () => renderDownloadImage(await QRCode.toDataURL(profileUrl, qrRenderOptions(style)), code, displayLabel, style),
      result => setRendered({ key: renderKey, ...result })
    );
  }, [code, displayLabel, profileUrl, style, renderKey, colorError, styleCurrent]);

  useEffect(() => {
    const dialog = previewRef.current;
    if (!previewVisible || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native modality makes the underlying Profile drawer inert without hiding this child.
    dialog.showModal();
    previewCloseRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [previewVisible]);

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
          aria-label={ui("ui.components.QrDownload.9500f9846391", "Open large QR preview")}
          disabled={!dataUrl}
        >
          {dataUrl ? <img src={dataUrl} alt="" /> : <span>{ui("ui.components.QrDownload.a439fba430a3", "QR")}</span>}
        </button>
        <div>
          <strong>{code}</strong>
          <span>{label}</span>
        </div>
      </div>

      <div className="qr-primary-actions">
        {dataUrl ? (
          <a className="button secondary qr-download-button" href={dataUrl} download={`qrguitar-${code}.png`}>{ui("ui.components.QrDownload.d6eafe823591", "Download")}</a>
        ) : (
          <button className="button secondary qr-download-button" type="button" disabled>
            {renderError ? ui("ui.components.QrDownload.2f180e49010d", "Download unavailable") : ui("ui.components.QrDownload.cf1aa6cc5951", "Preparing")}
          </button>
        )}
        <button className="button secondary qr-edit-button" type="button" onClick={() => setIsEditing((current) => !current)}>
          {isEditing ? ui("ui.components.QrDownload.7d9eb7acb13e", "Close") : ui("ui.components.QrDownload.c6e3168391a9", "Customize QR")}
        </button>
        {showPrintHandout ? (
          <a className="button secondary qr-handout-button" href={`/handout/${encodeURIComponent(code)}`} target="_blank" rel="noreferrer">{ui("ui.components.QrDownload.5ee3796350c7", "Open Print Suite")}</a>
        ) : null}
      </div>

      {renderError ? <p className="form-message" role="alert">{renderError} {!colorError ? <button className="link-button" type="button" onClick={() => setRetry(value => value + 1)}>{ui("ui.components.QrDownload.d8b8392e2c54", "Try again")}</button> : null}</p> : null}

      {isEditing ? (
        <div className="qr-editor-panel">
          <div className="qr-preset-row" aria-label={ui("ui.components.QrDownload.f99f7962fd39", "QR appearance presets")}>
            {qrPresets.map((preset) => {
              const isActive = isQrStyleMatch(preset.style, style);
              return (
                <button
                  className={`qr-preset ${isActive ? "selected" : ""}`}
                  type="button"
                  key={(preset.label === "White" ? ui("ui.components.QrDownload.3495e757855a", "White") : preset.label === "Transparent" ? ui("ui.components.QrDownload.aac7e89fcd0e", "Transparent") : preset.label === "Orange" ? ui("ui.components.QrDownload.78e7771b8b46", "Orange") : preset.label === "Print" ? ui("ui.components.QrDownload.df0fe79898ef", "Print") : preset.label)}
                  aria-pressed={isActive}
                  onClick={() => updateStyle(preset.style)}
                >
                  <strong>{(preset.label === "White" ? ui("ui.components.QrDownload.3495e757855a", "White") : preset.label === "Transparent" ? ui("ui.components.QrDownload.aac7e89fcd0e", "Transparent") : preset.label === "Orange" ? ui("ui.components.QrDownload.78e7771b8b46", "Orange") : preset.label === "Print" ? ui("ui.components.QrDownload.df0fe79898ef", "Print") : preset.label)}</strong>
                  <span>{preset.helper}</span>
                </button>
              );
            })}
          </div>
          <div className="qr-mini-controls" aria-label={ui("ui.components.QrDownload.2b8182617f0e", "Custom QR colors")}>
            <label>{ui("ui.components.QrDownload.40c995a68029", "QR Color")}<input
                type="color"
                value={style.foreground}
                onChange={(event) => updateStyle({ foreground: event.target.value })}
                aria-label={ui("ui.components.QrDownload.526957d2b9d2", "QR module color")}
              />
            </label>
            {!isTransparent ? (
              <label>{ui("ui.components.QrDownload.ea2b8a878841", "Background")}<input
                  type="color"
                  value={style.background}
                  onChange={(event) => updateStyle({ background: event.target.value })}
                  aria-label={ui("ui.components.QrDownload.c99579c0abce", "QR background color")}
                />
              </label>
            ) : null}
          </div>
          {!isTransparent ? (
            <>
              <label className="qr-label-control">{ui("ui.components.QrDownload.2d306eb2cde0", "QR label text")}<textarea
                  rows={2}
                  value={labelInput}
                  maxLength={140}
                  onChange={(event) => handleLabelChange(event.target.value)}
                  placeholder={fallbackLabelText}
                />
                <p className="qr-helper-text">{ui("ui.components.QrDownload.fdb5e68a9e01", "This text appears under the QR when label is enabled.")}</p>
              </label>
              <label className="qr-toggle">
                <input
                  type="checkbox"
                  checked={style.includeLabel}
                  onChange={(event) => updateStyle({ includeLabel: event.target.checked })}
                />{ui("ui.components.QrDownload.a050ee1a54b4", "Include instrument label under QR")}</label>
            </>
          ) : (
            <p className="qr-note">{ui("ui.components.QrDownload.6ddae7c01069", "Transparent export contains only the QR. Place it on a plain, contrasting background and keep the clear margin around every edge.")}</p>
          )}
        </div>
      ) : null}

      {previewVisible ? (
        <dialog
          ref={previewRef}
          className="media-overlay-backdrop"
          style={{ margin: 0, width: "100vw", maxWidth: "none", height: "100dvh", maxHeight: "none", border: 0, color: "inherit" }}
          aria-label={ui("ui.components.QrDownload.3310d3f61e2a", "QR preview")}
          onClick={(event) => { if (event.target === event.currentTarget) setIsLightboxOpen(false); }}
          onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setIsLightboxOpen(false); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setIsLightboxOpen(false);
            } else if (event.key === "Tab") {
              // Keep the outer drawer's document-level keyboard handler out of this modal.
              event.stopPropagation();
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
              }
            }
          }}
        >
          <div className="media-overlay-content qr-lightbox" onClick={(event) => event.stopPropagation()}>
            <div className="qr-lightbox-header">
              <strong>{ui("ui.components.QrDownload.6a108d03b4ca", "QR Preview")}</strong>
              <button ref={previewCloseRef} className="media-overlay-close qr-lightbox-close" type="button" onClick={() => setIsLightboxOpen(false)} aria-label={ui("ui.components.QrDownload.9aa176d79653", "Close QR preview")}>
                <X size={14} />
                <span>{ui("ui.components.QrDownload.7d9eb7acb13e", "Close")}</span>
              </button>
            </div>
            <div className="qr-lightbox-body">
              <div className={`qr-lightbox-frame ${isTransparent ? "transparent" : ""}`}>
                <img className="qr-lightbox-image" src={dataUrl} alt={ui("ui.components.QrDownload.c8a21e7587a0", "QR code preview")} />
              </div>
            </div>
            <div className="qr-lightbox-footer">
              <a className="button qr-lightbox-download" href={dataUrl} download={`qrguitar-${code}.png`}>
                <Download size={15} />{ui("ui.components.QrDownload.c61867c5855b", "Download PNG")}</a>
            </div>
          </div>
        </dialog>
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
      try {
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
      } catch (error) {
        reject(error);
      }
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
