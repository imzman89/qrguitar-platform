"use client";
import { useUiText } from "./UiTextProvider";
import { focusDialog, trapDialogTab } from "../lib/dialog-focus";


import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useEffect, useRef, useState } from "react";

type ActionDrawerProps = {
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  title: string;
};

export function ActionDrawer({ children, eyebrow, onClose, returnFocusTo, title }: ActionDrawerProps) {
  const ui = useUiText("components.ActionDrawer");
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const returnRef = useRef(returnFocusTo);
  closeRef.current = onClose;
  returnRef.current = returnFocusTo;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    focusDialog(panelRef.current);

    function handleKeyDown(event: KeyboardEvent) {
      // A native child dialog owns its keyboard interaction, including Escape.
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest("dialog[open]"))) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      trapDialogTab(event, panelRef.current);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);
      returnRef.current?.focus();
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="action-drawer-layer" role="presentation">
      <button className="action-drawer-backdrop" type="button" aria-label={ui("ui.components.ActionDrawer.1c1587ee93e7", "Close profile actions")} onClick={onClose} />
      <aside className="action-drawer" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="action-drawer-title" tabIndex={-1}>
        <header className="action-drawer-header">
          <div>
            {eyebrow ? <span>{eyebrow}</span> : null}
            <h2 id="action-drawer-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={ui("ui.components.ActionDrawer.1c1587ee93e7", "Close profile actions")} onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="action-drawer-scroll">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
