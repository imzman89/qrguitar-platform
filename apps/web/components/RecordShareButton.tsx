"use client";

import { Share2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";

type RecordShareButtonProps = {
  code: string;
  title: string;
  className?: string;
};

const publicSiteUrl = "https://www.qrguitar.com";

export function RecordShareButton({ code, title, className = "" }: RecordShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "ready">("idle");
  const url = `${publicSiteUrl}/i/${encodeURIComponent(code)}`;
  const label = title || code;

  async function shareRecord(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const shouldUseNativeShare = typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches;

      if (shouldUseNativeShare) {
        await navigator.share({
          title: label,
          text: `QRguitar Profile for ${label}`,
          url
        });
        setStatus("copied");
        window.setTimeout(() => setStatus("idle"), 1400);
        return;
      }

      await copyUrl(url);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch {
      setStatus("ready");
      window.setTimeout(() => setStatus("idle"), 3200);
    }
  }

  return (
    <span className={`record-share-wrap ${className}`.trim()}>
      <button className="record-share-button" type="button" aria-label="Share profile" onClick={shareRecord}>
        <Share2 size={15} />
      </button>
      {status !== "idle" ? (
        <span className="record-share-feedback">
          {status === "copied" ? "Link copied" : <a href={url}>Open link</a>}
        </span>
      ) : null}
    </span>
  );
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("Copy command failed");
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
