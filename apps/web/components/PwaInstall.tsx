"use client";
import { useUiText } from "./UiTextProvider";


import { Download, Share2 } from "lucide-react";
import { usePwaInstall } from "./PwaRuntime";
import styles from "./PwaInstall.module.css";

export function PwaInstall() {
  const ui = useUiText("components.PwaInstall");
  const { canPrompt, iosInstructions, installed, busy, message, install } = usePwaInstall();
  if (installed || (!canPrompt && !iosInstructions && !busy && !message)) return null;
  return (
    <section className={styles.card} aria-labelledby="qrguitar-install-title">
      <img src="/app-icons/qrguitar-192.png" alt="" width={52} height={52} />
      <div>
        <h2 id="qrguitar-install-title">{ui("ui.components.PwaInstall.f171a98f8645", "QRguitar, one tap away.")}</h2>
        <p>{ui("ui.components.PwaInstall.f27c6dbee587", "Add QRguitar to your device for quick access to your collection. Profiles and changes need an internet connection.")}</p>
        {canPrompt || busy ? <button type="button" className="button secondary" disabled={busy} onClick={install}><Download size={16} aria-hidden="true" />{busy ? ui("ui.components.PwaInstall.50aaf88a0fed", "Opening install…") : ui("ui.components.PwaInstall.2bba98486f9b", "Install QRguitar")}</button> : null}
        {iosInstructions && !canPrompt ? (
          <details>
            <summary><Share2 size={16} aria-hidden="true" />{ui("ui.components.PwaInstall.00c03664654c", "Add to your Home Screen")}</summary>
            <p>{ui("ui.components.PwaInstall.21e4bfef4e76", "Open QRguitar in Safari, tap Share, then Add to Home Screen. If shown, keep Open as Web App on, then tap Add.")}</p>
            <p>{ui("ui.components.PwaInstall.d847e0376f46", "If Add to Home Screen is missing, look under Edit Actions in the Share menu.")}</p>
          </details>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </section>
  );
}
