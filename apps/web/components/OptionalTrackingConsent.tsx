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
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    if (!configuredOptionalTracking.enabled) return;
    const update = () => setConsent(readOptionalTrackingConsent());
    update();
    return subscribeToOptionalTrackingConsent(update);
  }, []);

  if (!configuredOptionalTracking.enabled || !consent) return null;

  const choose = (decision: OptionalTrackingDecision) => {
    setStorageError(false);
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
      <aside aria-label="Privacy choices" className={styles.preference}>
        <span>Privacy choices</span>
        <button type="button" onClick={() => choose("denied")}>Turn off</button>
      </aside>
    );
  }

  if (consent.status === "denied" && !managing) {
    return (
      <>
        <button className={styles.preferenceTrigger} type="button" onClick={() => setManaging(true)}>
          Privacy choices
        </button>
        {storageError ? (
          <span className={styles.statusOnly} role="status">Your browser could not save that choice. Optional tracking is off for this page.</span>
        ) : null}
      </>
    );
  }

  return (
    <aside
      aria-describedby="optional-tracking-consent-copy"
      aria-label="Optional tracking choices"
      className={styles.notice}
      role="dialog"
    >
      <p id="optional-tracking-consent-copy">
        {consent.status === "pending" ? consentQuestion() : "Optional tracking is off. You can allow it here or keep it off."}
      </p>
      <div className={styles.controls}>
        <Link className={styles.privacyLink} href="/privacy">Privacy</Link>
        <button type="button" onClick={() => choose("accepted")}>Accept</button>
        <button type="button" onClick={() => choose("denied")}>{consent.status === "pending" ? "Deny" : "Keep off"}</button>
      </div>
      {storageError ? (
        <p className={styles.error} role="status">Your browser could not save that choice. Optional tracking is off for this page.</p>
      ) : null}
    </aside>
  );
}
