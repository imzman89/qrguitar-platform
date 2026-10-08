"use client";
import { useRef, useState } from "react";
import styles from "./ClaimOwnerReview.module.css";
import { useUiText } from "./UiTextProvider";

export type OwnerClaimReview = {
  id: string; canReview?: boolean; status: string;
  acquisitionDetails?: string; ownershipDeclaration?: string;
  evidence?: Array<{ id: string; fileName: string; url: string }>;
};
export function ClaimOwnerReview({ claim, disabled, onDecision }: {
  claim: OwnerClaimReview; disabled: boolean;
  onDecision(action: "approve" | "deny", note: string): Promise<boolean>;
}) {
  const ui = useUiText("components.ClaimOwnerReview");
  const [choice, setChoice] = useState<"approve" | "deny" | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const opener = useRef<"approve" | "deny">("approve");
  const approveButton = useRef<HTMLButtonElement | null>(null);
  const declineButton = useRef<HTMLButtonElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  if (claim.canReview !== true || claim.status !== "awaiting_owner") return null;
  const busy = disabled || pending;
  function choose(action: "approve" | "deny") {
    if (busy) return;
    opener.current = action; setChoice(action);
    window.requestAnimationFrame(() => cancel.current?.focus());
  }
  function close() {
    if (busy) return;
    setChoice(null); window.requestAnimationFrame(() => (opener.current === "approve" ? approveButton : declineButton).current?.focus());
  }
  async function confirm() {
    if (!choice || busy || submitting.current || !note.trim()) return;
    submitting.current = true; setPending(true);
    try { if (await onDecision(choice, note.trim())) { setChoice(null); setNote(""); } }
    finally { submitting.current = false; setPending(false); }
  }
  return <section className={styles.review} aria-label={ui("ui.components.ClaimOwnerReview.title", "Review this ownership request")}>
    <h4>{ui("ui.components.ClaimOwnerReview.title", "Review this ownership request")}</h4>
    {claim.acquisitionDetails ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>{ui("ui.components.ClaimOwnerReview.acquisition", "How it was acquired")}</strong><br />{claim.acquisitionDetails}</p> : null}
    {claim.ownershipDeclaration ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>{ui("ui.components.ClaimOwnerReview.declaration", "Claimant’s declaration")}</strong><br />{claim.ownershipDeclaration}</p> : null}
    {claim.evidence?.length ? <ul>{claim.evidence.map(file => {
      let safe = false;
      try { safe = new URL(file.url).protocol === "https:"; } catch { /* No link for an invalid response. */ }
      return <li key={file.id} style={{ overflowWrap: "anywhere" }}>{safe ? <a href={file.url} target="_blank" rel="noopener noreferrer">{file.fileName}</a> : <span>{file.fileName}</span>}</li>;
    })}</ul> : null}
    {!choice ? <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button className="button" type="button" disabled={busy} ref={approveButton} onClick={() => choose("approve")}>{ui("ui.components.ClaimOwnerReview.approve", "Approve ownership request")}</button>
      <button className="button secondary" type="button" disabled={busy} ref={declineButton} onClick={() => choose("deny")}>{ui("ui.components.ClaimOwnerReview.decline", "Decline request")}</button>
    </div> : <div className={styles.confirmation} role="group" aria-labelledby={"claim-decision-" + claim.id} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <h4 id={"claim-decision-" + claim.id}>{choice === "approve" ? ui("ui.components.ClaimOwnerReview.approveTitle", "Transfer this Profile to the claimant?") : ui("ui.components.ClaimOwnerReview.declineTitle", "Decline this request?")}</h4>
      <p>{choice === "approve" ? ui("ui.components.ClaimOwnerReview.approveBody", "Approval moves this Profile to the claimant’s account. Its permanent link and history stay the same. Check the private evidence before confirming.") : ui("ui.components.ClaimOwnerReview.declineBody", "This closes the request. The Profile remains in your account.")}</p>
      <label>{ui("ui.components.ClaimOwnerReview.note", "Reason for your decision")}<textarea rows={3} maxLength={1000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <button ref={cancel} className="button secondary" type="button" disabled={busy} onClick={close}>{ui("ui.components.ClaimOwnerReview.cancel", "Keep reviewing")}</button>
        <button className="button" type="button" disabled={busy || !note.trim()} onClick={() => void confirm()}>{pending ? ui("ui.components.ClaimOwnerReview.saving", "Saving decision…") : ui("ui.components.ClaimOwnerReview.confirm", "Confirm decision")}</button>
      </div>
    </div>}
  </section>;
}
