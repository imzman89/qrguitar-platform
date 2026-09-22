"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { useEffect, useState } from "react";
import styles from "./OptionalTrackingConsent.module.css";
import {
  configuredOptionalTracking,
  readOptionalTrackingConsent,
  saveOptionalTrackingConsent,
  saveOptionalTrackingConsentForReload,
  subscribeToOptionalTrackingConsent,
  type OptionalTrackingConsentState,
  type OptionalTrackingDecision
} from "../lib/optional-tracking-consent";
import { hasConfiguredOptionalTrackingProvider } from "../lib/google-analytics-config";

function consentQuestion() {
  const { purposes } = configuredOptionalTracking;
  if (purposes.length === 1 && purposes[0] === "analytics") {
    return "Allow optional analytics to measure visits and improve QRguitar?";
  }
  if (purposes.length === 1 && purposes[0] === "advertising") {
    return "Allow optional advertising measurement to understand QRguitar's growth?";
  }
  return "Allow optional analytics and advertising measurement to improve and grow QRguitar?";
}

export function OptionalTrackingConsent() {
  const ui = useUiText("components.OptionalTrackingConsent");
  const [consent, setConsent] = useState<OptionalTrackingConsentState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    if (!hasConfiguredOptionalTrackingProvider()) return;
    const update = () => setConsent(readOptionalTrackingConsent());
    update();
    return subscribeToOptionalTrackingConsent(update);
  }, []);

  if (!hasConfiguredOptionalTrackingProvider() || !consent) return null;

  const choose = (decision: OptionalTrackingDecision) => {
    setStorageError(false);
    if (decision === "accepted" && consent.status === "denied") {
      if (saveOptionalTrackingConsentForReload()) {
        window.location.reload();
        return;
      }
      setStorageError(true);
      return;
    }
    if (saveOptionalTrackingConsent(decision)) {
      setConsent(readOptionalTrackingConsent());
      setManaging(false);
      return;
    }
    if (decision === "denied") {
      setConsent(readOptionalTrackingConsent());
      setManaging(false);
      setStorageError(true);
      return;
    }
    setStorageError(true);
  };

  if (consent.status === "accepted" && !managing) {
    return (
      <aside aria-label={ui("ui.components.OptionalTrackingConsent.fa1a9c947c79", "Privacy choices")} className={styles.preference}>
        <span>{ui("ui.components.OptionalTrackingConsent.fa1a9c947c79", "Privacy choices")}</span>
        <button type="button" onClick={() => choose("denied")}>{ui("ui.components.OptionalTrackingConsent.06f0e210b27d", "Turn off")}</button>
      </aside>
    );
  }

  if (consent.status === "denied" && !managing) {
    return (
      <>
        <button className={styles.preferenceTrigger} type="button" onClick={() => setManaging(true)}>{ui("ui.components.OptionalTrackingConsent.fa1a9c947c79", "Privacy choices")}</button>
        {storageError ? (
          <span className={styles.statusOnly} role="status">{ui("ui.components.OptionalTrackingConsent.20bd75748803", "Your browser could not save that choice. Optional tracking is off for this page.")}</span>
        ) : null}
      </>
    );
  }

  return (
    <aside
      aria-describedby="optional-tracking-consent-copy"
      aria-label={ui("ui.components.OptionalTrackingConsent.6633c9b4a1f3", "Optional tracking choices")}
      className={styles.notice}
      role="dialog"
    >
      <p id="optional-tracking-consent-copy">
        {consent.status === "pending" ? consentQuestion() : ui("ui.components.OptionalTrackingConsent.b9f17c08f7b6", "Optional tracking is off. You can allow it here or keep it off.")}
      </p>
      <div className={styles.controls}>
        <Link className={styles.privacyLink} href="/privacy">{ui("ui.components.OptionalTrackingConsent.54a57c3147c4", "Privacy")}</Link>
        <button type="button" onClick={() => choose("accepted")}>{ui("ui.components.OptionalTrackingConsent.89713b9c9c1b", "Accept")}</button>
        <button type="button" onClick={() => choose("denied")}>{consent.status === "pending" ? ui("ui.components.OptionalTrackingConsent.05a2d7332eb9", "Deny") : ui("ui.components.OptionalTrackingConsent.41a94e4f8462", "Keep off")}</button>
      </div>
      {storageError ? (
        <p className={styles.error} role="status">{ui("ui.components.OptionalTrackingConsent.20bd75748803", "Your browser could not save that choice. Optional tracking is off for this page.")}</p>
      ) : null}
    </aside>
  );
}
