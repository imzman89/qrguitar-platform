"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./OptionalTrackingConsent.module.css";
import {
  configuredOptionalTracking,
  readOptionalTrackingConsent,
  saveOptionalTrackingConsent,
  subscribeToOptionalTrackingConsent,
  type OptionalTrackingConsentState,
  type OptionalTrackingDecision
} from "../lib/optional-tracking-consent";

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
  const [consent, setConsent] = useState<OptionalTrackingConsentState | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    if (!configuredOptionalTracking.enabled) return;
    const update = () => setConsent(readOptionalTrackingConsent());
    update();
    return subscribeToOptionalTrackingConsent(update);
  }, []);

  if (!configuredOptionalTracking.enabled || consent?.status !== "pending") return null;

  const choose = (decision: OptionalTrackingDecision) => {
    setStorageError(false);
    if (saveOptionalTrackingConsent(decision)) {
      setConsent(readOptionalTrackingConsent());
      return;
    }
    if (decision === "denied") {
      setConsent({ status: "denied", purposes: configuredOptionalTracking.purposes });
      return;
    }
    setStorageError(true);
  };

  return (
    <aside
      aria-describedby="optional-tracking-consent-copy"
      aria-label="Optional tracking choices"
      className={styles.notice}
      role="dialog"
    >
      <p id="optional-tracking-consent-copy">{consentQuestion()}</p>
      <div className={styles.controls}>
        <Link className={styles.privacyLink} href="/privacy">Privacy</Link>
        <button type="button" onClick={() => choose("accepted")}>Accept</button>
        <button type="button" onClick={() => choose("denied")}>Deny</button>
      </div>
      {storageError ? (
        <p className={styles.error} role="status">Your browser could not save that choice. Optional tracking stays off.</p>
      ) : null}
    </aside>
  );
}
