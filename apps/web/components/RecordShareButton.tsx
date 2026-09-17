"use client";

import { Share2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { publicProfileUrl } from "../lib/profile-url";

type RecordShareButtonProps = {
  code: string;
  title: string;
  className?: string;
  showLabel?: boolean;
};

// Browser share and clipboard operations cannot be cancelled by unmounting a button.
let pendingShareOperation: symbol | null = null;

export function RecordShareButton({ code, title, className = "", showLabel = false }: RecordShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "ready">("idle");
  const revision = useRef(0);
  const active = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  const url = publicProfileUrl(code);
  const label = title || code;

  useEffect(() => {
    active.current = true;
    setStatus("idle");
    return () => {
      active.current = false;
      revision.current++;
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [url]);

  async function shareRecord(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pendingShareOperation || !active.current) return;
    const operation = Symbol("record-share");
    pendingShareOperation = operation;
    const attempt = ++revision.current;
    const isCurrent = () => active.current && revision.current === attempt;
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    setStatus("idle");
    function feedback(next: "shared" | "copied" | "ready") {
      if (!isCurrent()) return;
      setStatus(next);
      timer.current = window.setTimeout(() => { if (isCurrent()) setStatus("idle"); }, next === "ready" ? 3200 : 1400);
    }

    try {
      const shouldUseNativeShare = typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches;

      if (shouldUseNativeShare) {
        try {
          await navigator.share({ title: label, text: `QRguitar Profile for ${label}`, url });
        } catch (error) {
          if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
          throw error;
        }
        feedback("shared");
        return;
      }

      await copyUrl(url, isCurrent);
      feedback("copied");
    } catch {
      feedback("ready");
    } finally {
      if (pendingShareOperation === operation) pendingShareOperation = null;
    }
  }

  return (
    <span className={`record-share-wrap ${className}`.trim()}>
      <button className="record-share-button" type="button" aria-label="Share Profile" onClick={shareRecord}>
        <Share2 size={15} />
        {showLabel ? <span>Share Profile</span> : null}
      </button>
      {status !== "idle" ? (
        <span className="record-share-feedback" role="status">
          {status === "copied" ? "Link copied" : status === "shared" ? "Share opened" : <a href={url}>Open link</a>}
        </span>
      ) : null}
    </span>
  );
}

async function copyUrl(url: string, isCurrent: () => boolean) {
  try {
    await navigator.clipboard.writeText(url);
    return;
  } catch {
    if (!isCurrent()) return;
    const focused = document.activeElement as HTMLElement | null;
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("Copy command failed");
      }
    } finally {
      document.body.removeChild(textarea);
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    }
  }
}
