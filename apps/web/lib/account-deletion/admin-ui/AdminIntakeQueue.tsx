"use client";

import { useEffect, useRef, useState } from "react";
import { adminIntakeAuth } from "./admin-intake-auth";
import { createAdminIntakeClient, initialQueueState, type QueueAction, type QueueAuth, type QueueState } from "./admin-intake-client";
import styles from "./admin-intake.module.css";

const blockerCopy: Record<string,string> = {
  administrator_account:"Transfer or remove administrator authority through a separately reviewed change.",
  unused_paid_credits:"Resolve the customer’s unused purchased credits or approved refund. Credits are never silently forfeited.",
  unresolved_payment_order:"Close or resolve the open payment order before retrying.",
  payment_hold_or_dispute:"Resolve the payment hold, refund, reversal, or dispute before retrying.",
  billing_retention_review_required:"Review the immutable billing history and confirm its exact fingerprint before QRguitar replaces the account link with a private ledger subject.",
  unused_profile_credits:"Resolve the account’s remaining Profile-credit balance before retrying.",
  storage_cleanup_required:"QRguitar still has account-bound private files to resolve. Run fulfillment again; retained files are verified before source removal, and unreferenced files require durable deletion authorization.",
  storage_quiescence_required:"Account writes are frozen and public content is hidden. Wait until the recorded storage deadline, then retry so QRguitar can rescan for uploads issued before the freeze.",
  active_ownership_transfer:"Finish or cancel the active ownership transfer before retrying.",
  active_ownership_claim:"Finish or cancel the active ownership claim before retrying.",
  active_service_workflow:"Finish or cancel the active service workflow before retrying.",
  service_history_privacy_review_required:"Review the retained service history and confirm its exact fingerprint before QRguitar replaces the account link with a private history subject.",
  profile_history_privacy_review_required:"Review each historically connected Profile below. Every required Profile needs a current fingerprint confirmation.",
  retained_personal_content_review_required:"Remove or privacy-migrate the recorded cross-account Site Editor or audit content, retain an audit receipt, then retry."
};

function ReviewSections({ sections }: { sections: import("./admin-intake-client").QueueReviewSection[] }) {
  return <div className={styles.snapshotSections}>{sections.map(section=><details className={styles.snapshotSection} key={section.code} open={section.code==="guitar"}>
    <summary><span>{section.label}</span><small>{section.recordCount} record{section.recordCount===1?"":"s"}</small></summary>
    {section.records.length?<div className={styles.snapshotRecords}>{section.records.map((record,index)=><pre key={`${section.contentDigest}-${index}`}>{JSON.stringify(record,null,2)}</pre>)}</div>:<p>{section.recordCount?"Record values are withheld because this snapshot exceeds the verified inspection limit.":"No retained records in this section."}</p>}
    <code title="Section content digest">{section.contentDigest}</code>
  </details>)}</div>;
}

function custodyReleaseCandidates(snapshot: import("./admin-intake-client").QueueReviewSnapshot | null) {
  if (!snapshot || snapshot.kind !== "profile" || snapshot.truncated) return [];
  const claims = snapshot.profile.sections.find(section => section.code === "claims")?.records || [];
  const evidence = snapshot.profile.sections.find(section => section.code === "claimEvidence")?.records || [];
  const id = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const evidenceCounts = new Map<string,number>();
  for (const record of evidence) if (record && typeof record === "object" && !Array.isArray(record) && id(record.claim_id)) {
    const claimId = record.claim_id.toLowerCase(); evidenceCounts.set(claimId, (evidenceCounts.get(claimId) || 0) + 1);
  }
  const candidates: { claimId:string; evidenceCount:number }[] = [], seen = new Set<string>();
  for (const record of claims) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !id(record.id) || record.status !== "admin_review"
      || !id(record.guitar_id) || record.guitar_id.toLowerCase() !== snapshot.profile.guitarId) continue;
    const claimId = record.id.toLowerCase(), evidenceCount = evidenceCounts.get(claimId) || 0;
    if (evidenceCount < 1 || seen.has(claimId)) continue;
    seen.add(claimId); candidates.push({ claimId, evidenceCount });
  }
  return candidates;
}

export function custodyReleasePrompt(evidenceCount:number) {
  return Number.isSafeInteger(evidenceCount) && evidenceCount > 0
    ? `Release custody after reviewing ${evidenceCount} retained proof item${evidenceCount===1?"":"s"}? Ownership will move to the verified claimant, and the Profile will remain private until its new owner chooses otherwise.`
    : "";
}
export function storageDecisionPrompt(decision:"retain"|"delete") {
  return decision==="retain"
    ? "Retain this exact private file after reviewing its content for the departing account’s personal information? The recorded byte fingerprint must still match before QRguitar can copy it."
    : "Delete this exact private file instead of retaining a copy? The decision is bound to this byte fingerprint and cannot silently become retain.";
}
const storageLabel=(bucket:string)=>bucket==="instrument-media"?"Instrument image":bucket==="instrument-documents"?"Instrument document":"Service evidence";
const storageSize=(size:number|null)=>size===null?"Size will be verified by the server":size<1024?`${size} bytes`:size<1024*1024?`${(size/1024).toFixed(1)} KiB`:`${(size/(1024*1024)).toFixed(1)} MiB`;

export function AdminIntakeQueueView({ state, onRefresh, onMore, onExecute, onInspectStorage, onInspectCustody }: { state: QueueState; onRefresh(): void; onMore(): void; onExecute(requestId:string,action?:QueueAction): void; onInspectStorage(requestId:string,relocationId:string,sourceFingerprint:string):void; onInspectCustody(requestId:string,claimId:string,evidenceId:string,objectFingerprint:string):void }) {
  const visible = state.phase === "ready";
  return <section className={styles.queue} aria-labelledby="deletion-queue-title" aria-busy={state.busy}>
    <a className={styles.back} href="/admin">← Back to Admin</a>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Privacy operations</p><h1 id="deletion-queue-title">Deletion review requests</h1><p>Requests to remove personal information while preserving permanent instrument Profiles and factual history.</p></div>
      <span className={styles.mode}>Reviewed fulfillment</span>
    </header>
    <div className={styles.toolbar}>
      <p>{visible ? <><strong>{state.requests.length}</strong> pending request{state.requests.length === 1 ? "" : "s"} loaded · Newest first</> : "Current administrator access is required."}</p>
      <button className={styles.button} type="button" disabled={state.busy} onClick={onRefresh}>{state.busy ? "Checking queue…" : "Refresh queue"}</button>
    </div>
    {state.phase === "loading" && <p className={styles.notice} role="status">Checking the request queue…</p>}
    {state.phase === "signed-out" && <div className={styles.notice} role="status"><h2>Sign in to view requests</h2><p>Use your administrator account to continue.</p><a className={styles.button} href="/login?next=%2Fadmin%2Fdeletion-requests">Sign in</a></div>}
    {state.phase === "forbidden" && <div className={styles.notice} role="alert"><h2>Administrator access required</h2><p>This account is not authorized to view the private intake queue.</p></div>}
    {state.phase === "error" && <div className={styles.error} role="alert"><h2>Queue unavailable</h2><p>{state.error}</p></div>}
    {visible && <>
      <p className={styles.guidance}>A submitted request is not a deletion receipt. The safe check stops on paid credits, payment review, private storage, or unresolved workflows. A clear result anonymizes database identity, deletes Auth, and holds retained instrument Profiles private for a later custody review.</p>
      {state.actionMessage && <p className={styles.success} role="status">{state.actionMessage}</p>}
      {state.actionError && <p className={styles.error} role="alert">{state.actionError}</p>}
      {state.requests.length ? <ol className={styles.list} aria-label="Pending deletion review requests">
        {state.requests.map(row => { const retention=row.retentionReviews.filter(review=>review.required||review.attested),loaded=state.reviewRequestId===row.requestId?state.reviewSnapshot:null; return <li className={styles.card} key={row.requestId}>
          <div className={styles.cardHeading}><h2>Review request</h2><span className={styles.status}>Requested</span></div>
          <dl><div><dt>Request reference</dt><dd><code>{row.requestId}</code></dd></div><div><dt>Actor ID</dt><dd>{row.actorId ? <code>{row.actorId}</code> : "Identity unlinked"}</dd></div><div className={styles.time}><dt>Requested at</dt><dd><time dateTime={row.requestedAt}>{row.requestedAt}</time></dd></div></dl>
          {(row.fulfillment?.state === "blocked" || row.fulfillment?.state === "quiescing_storage") && <div className={styles.blockers}>
            <strong>{row.fulfillment.state === "quiescing_storage" ? "Storage safety window" : "Blocked safely"}</strong>
            {row.fulfillment.state === "quiescing_storage" && row.fulfillment.storageQuiesceUntil ? <p>Retry after <time dateTime={row.fulfillment.storageQuiesceUntil}>{row.fulfillment.storageQuiesceUntil}</time>. The deadline is fixed and does not extend on retries.</p> : null}
            <ul>{row.fulfillment.blockers.map(code=><li key={code}>{blockerCopy[code] || "Resolve this recorded blocker before retrying."}</li>)}</ul>
          </div>}
          {row.fulfillment?.state === "ready_for_auth_deletion" && <p className={styles.warning}>Database anonymization finished, but Auth deletion is not confirmed. Retry to reconcile; do not tell the customer deletion is complete.</p>}
          {row.storageReviews.length?<section className={styles.reviews} aria-label="Private file content reviews">
            <div className={styles.reviewHeading}><h3>Private file reviews</h3><span>{row.storageReviews.filter(review=>review.decision!==null).length} of {row.storageReviews.length} decided</span></div>
            <p>Open each exact private file before deciding whether its bytes may remain. Storage paths and uploader identities stay server-only.</p>
            <ol>{row.storageReviews.map(review=>{const inspected=state.storageInspection?.requestId===row.requestId&&state.storageInspection.relocationId===review.relocationId&&state.storageInspection.sourceFingerprint===review.sourceFingerprint?state.storageInspection:null;return <li className={styles.reviewCard} key={review.relocationId}>
              <div><strong>{storageLabel(review.bucket)}</strong><span className={review.decision?styles.confirmed:styles.pending}>{review.decision?`${review.decision} recorded`:"Review required"}</span></div>
              <p>{review.sourceMimeType||"Unknown media type"} · {storageSize(review.sourceSize)}</p><code title="Private file fingerprint">{review.sourceFingerprint}</code>
              {!review.decision&&!inspected?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onInspectStorage(row.requestId,review.relocationId,review.sourceFingerprint)}>Inspect exact private file</button>:null}
              {!review.decision&&inspected?<div className={styles.snapshot}>
                <div className={styles.reviewHeading}><h4>Authenticated byte-bound preview</h4><span>{storageSize(inspected.byteSize)}</span></div>
                {inspected.mimeType==="application/pdf"?<iframe className={styles.storagePreview} src={inspected.objectUrl} title="Private PDF content review" sandbox="" referrerPolicy="no-referrer"/>:<img className={styles.storagePreview} src={inspected.objectUrl} alt="Private file content under administrator review" referrerPolicy="no-referrer"/>}
                <p>Inspect the entire visible file. The server also parses the container for hidden EXIF, XMP, PDF properties, embedded files, and active content before hashing it again.</p>
                {!inspected.safeToRetain?<p className={styles.warning}>{inspected.metadataFindings.includes("original-image-container")?"Delete required: QRguitar cannot safely retain original image-container bytes because they can carry information outside the visible picture.":`Delete required: ${inspected.structureValid?`hidden ${inspected.metadataFindings.join(", ")} metadata was found`:"the file container is malformed"}. Retaining these bytes could preserve unseen personal information.`}</p>:<p>No hidden metadata or malformed container structure was detected.</p>}
                <div className={styles.storageActions}>{inspected.safeToRetain?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"attest_storage",relocationId:review.relocationId,expectedFingerprint:review.sourceFingerprint,decision:"retain"})}>Retain reviewed file</button>:null}<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"attest_storage",relocationId:review.relocationId,expectedFingerprint:review.sourceFingerprint,decision:"delete"})}>Delete reviewed file</button></div>
              </div>:null}
              {review.decision?<p>{review.decision==="retain"?"The exact reviewed bytes are approved for private relocation.":"The exact reviewed bytes are approved for durable deletion."}</p>:null}
            </li>})}</ol>
          </section>:null}
          {row.profileReviews.length ? <section className={styles.reviews} aria-label="Historically connected Profile reviews">
            <div className={styles.reviewHeading}><h3>Profile privacy reviews</h3><span>{row.profileReviews.filter(review=>review.attested).length} of {row.profileReviews.length} confirmed</span></div>
            <p>Open each Profile, check the retained record for the departing account’s UUID and current email, then confirm only the fingerprint shown here.</p>
            <ol>{row.profileReviews.map(review=>{const snapshot=loaded?.kind==="profile"&&loaded.profile.guitarId===review.guitarId&&loaded.contentFingerprint===review.contentFingerprint?loaded:null,custodyClaims=row.fulfillment?.state==="completed"?custodyReleaseCandidates(snapshot):[];return <li className={styles.reviewCard} key={review.guitarId}>
              <div><strong>{review.qrCode}</strong><span className={review.attested?styles.confirmed:styles.pending}>{review.attested?"Confirmed":"Review required"}</span></div>
              <p>Connections: {review.relationshipCodes.map(code=>code.replaceAll("_"," ")).join(", ")}</p>
              <code title="Content fingerprint">{review.contentFingerprint}</code>
              {!snapshot&&<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_profile",guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint,pageIndex:0})}>Inspect private Profile record</button>}
              {snapshot&&<div className={styles.snapshot}>
                <div className={styles.reviewHeading}><h4>Private fingerprint-bound snapshot</h4><span>Page {snapshot.pageIndex+1} of {snapshot.pageCount} · {snapshot.deliveredPages} delivered</span></div>
                {snapshot.truncated?<><p className={styles.warning}>This Profile exceeds the verified 500-record or 512 KiB review limit. Record values are withheld, each section’s count and digest remain visible, and confirmation is unavailable.</p><ReviewSections sections={snapshot.profile.sections}/></>:<>
                  <p>Review every nonempty section for personal information belonging to the departing account. This is the projected retained record; fulfillment separately removes the exact Auth UUID and current email. Secret keys and internal identity links are removed from this browser view.</p>
                  <ReviewSections sections={snapshot.profile.sections}/>
                  {snapshot.pageCount>1?<div className={styles.storageActions}>{snapshot.pageIndex>0?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_profile",guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint,pageIndex:snapshot.pageIndex-1})}>Previous review page</button>:null}{snapshot.pageIndex+1<snapshot.pageCount?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_profile",guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint,pageIndex:snapshot.pageIndex+1})}>Load next review page</button>:null}</div>:null}
                  {!snapshot.allPagesDelivered?<p className={styles.warning}>Load every fingerprint-bound page before final confirmation. Any record mutation changes the aggregate fingerprint and makes these page receipts stale.</p>:null}
                  {custodyClaims.length?<div className={styles.redaction}><strong>Evidence-backed custody claims</strong><p>Release only after matching every retained proof item to the verified claimant. Ownership changes now; the Profile stays private until the new owner chooses otherwise.</p>
                    {custodyClaims.map(claim=>{const inventory=state.custodyEvidence?.claimId===claim.claimId&&state.custodyEvidence.profileFingerprint===review.contentFingerprint?state.custodyEvidence:null;
                      const allReviewed=Boolean(inventory&&inventory.evidenceCount===claim.evidenceCount&&inventory.reviewedCount===inventory.evidenceCount);return <div key={claim.claimId}><p><code>{claim.claimId}</code> · {claim.evidenceCount} retained proof item{claim.evidenceCount===1?"":"s"}</p>
                      {!inventory?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_custody",claimId:claim.claimId,expectedFingerprint:review.contentFingerprint,pageIndex:0})}>Load current proof files</button>:<ol>{inventory.evidence.map(item=>{const proof=state.custodyInspection?.requestId===row.requestId&&state.custodyInspection.claimId===claim.claimId&&state.custodyInspection.evidenceId===item.evidenceId&&state.custodyInspection.objectFingerprint===item.objectFingerprint?state.custodyInspection:null;return <li className={styles.reviewCard} key={item.evidenceId}><div><strong>Ownership proof</strong><span className={item.reviewed?styles.confirmed:styles.pending}>{item.reviewed?"Byte receipt recorded":"Inspection required"}</span></div><p>{item.mimeType} · {storageSize(item.byteSize)}</p><code>{item.objectFingerprint}</code>
                        {!item.reviewed&&!proof?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onInspectCustody(row.requestId,claim.claimId,item.evidenceId,item.objectFingerprint)}>Inspect exact proof file</button>:null}
                        {!item.reviewed&&proof?<div className={styles.snapshot}>{proof.mimeType==="application/pdf"?<iframe className={styles.storagePreview} src={proof.objectUrl} title="Private ownership proof review" sandbox="" referrerPolicy="no-referrer"/>:<img className={styles.storagePreview} src={proof.objectUrl} alt="Private ownership proof under administrator review" referrerPolicy="no-referrer"/>}<p>Inspect the entire proof. The server downloads and hashes it again before recording the receipt.</p><button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"attest_custody_evidence",claimId:claim.claimId,evidenceId:item.evidenceId,expectedFingerprint:review.contentFingerprint,expectedObjectFingerprint:item.objectFingerprint,pageIndex:inventory.pageIndex})}>Record exact proof review</button></div>:null}</li>})}</ol>}{inventory?<><p>Proof page {inventory.pageIndex+1} of {inventory.pageCount} · {inventory.reviewedCount} of {inventory.evidenceCount} exact byte receipts recorded.</p>{inventory.pageCount>1?<div className={styles.storageActions}>{inventory.pageIndex>0?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_custody",claimId:claim.claimId,expectedFingerprint:review.contentFingerprint,pageIndex:inventory.pageIndex-1})}>Previous proof page</button>:null}{inventory.pageIndex+1<inventory.pageCount?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_custody",claimId:claim.claimId,expectedFingerprint:review.contentFingerprint,pageIndex:inventory.pageIndex+1})}>Next proof page</button>:null}</div>:null}</>:null}
                      {allReviewed?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"release_custody",claimId:claim.claimId,expectedFingerprint:review.contentFingerprint})}>Release custody to verified claimant</button>:<p>Every current proof file needs a matching byte receipt before release.</p>}</div>})}
                  </div>:null}
                  {!review.attested&&<form className={styles.redaction} onSubmit={event=>{event.preventDefault();const field=event.currentTarget.elements.namedItem("terms");if(!(field instanceof HTMLTextAreaElement))return;const terms=[...new Set(field.value.split(/\r?\n/).map(term=>term.trim()).filter(Boolean))],invalid=terms.length<1||terms.length>32||terms.some(term=>[...term].length<3||[...term].length>200||/[\u0000-\u001f\u007f]/.test(term));field.setCustomValidity(invalid?"Enter 1 to 32 exact phrases, each 3 to 200 characters, with no control characters.":"");if(invalid){field.reportValidity();return;}onExecute(row.requestId,{action:"redact_profile",guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint,terms});}}>
                    <label>Personal information to remove<textarea name="terms" required rows={3} placeholder="One exact name, email, address, or other identifying phrase per line"/></label>
                    <p>Use exact personal phrases of at least 3 characters. Redaction changes retained records and requires a fresh inspection.</p>
                    <button className={styles.button} type="submit" disabled={state.busy||Boolean(state.actionRequestId)}>Redact listed terms</button>
                  </form>}
                  {!review.attested&&snapshot.allPagesDelivered&&<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"attest_profile",guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint})}>Confirm no additional personal information remains</button>}
                </>}
              </div>}
            </li>})}</ol>
          </section>:null}
          {retention.length ? <section className={styles.reviews} aria-label="Retained history reviews">
            <div className={styles.reviewHeading}><h3>Retained history reviews</h3><span>{retention.filter(review=>review.attested).length} of {retention.length} confirmed</span></div>
            <p>Confirm the exact immutable record set only after checking that it contains required factual history and no removable personal information.</p>
            <ol>{retention.map(review=>{const snapshot=loaded?.kind==="retention"&&loaded.retention.domain===review.domain&&loaded.contentFingerprint===review.contentFingerprint?loaded:null;return <li className={styles.reviewCard} key={review.domain}>
              <div><strong>{review.domain==="billing"?"Billing ledger":"Service history"}</strong><span className={review.attested?styles.confirmed:styles.pending}>{review.attested?"Confirmed":"Review required"}</span></div>
              <code title="Content fingerprint">{review.contentFingerprint}</code>
              {!snapshot&&<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_retention",domain:review.domain,expectedFingerprint:review.contentFingerprint,pageIndex:0})}>Inspect private {review.domain==="billing"?"billing ledger":"service history"}</button>}
              {snapshot&&<div className={styles.snapshot}>
                <div className={styles.reviewHeading}><h4>Private fingerprint-bound snapshot</h4><span>Page {snapshot.pageIndex+1} of {snapshot.pageCount} · {snapshot.deliveredPages} delivered</span></div>
                {snapshot.truncated?<><p className={styles.warning}>This history exceeds the verified 500-record or 512 KiB review limit. Record values are withheld, each section’s count and digest remain visible, and confirmation is unavailable.</p><ReviewSections sections={snapshot.retention.sections}/></>:<>
                  <p>Review every nonempty section. Confirm only the factual records that must remain after the account identity is replaced by a private retention subject.</p>
                  <ReviewSections sections={snapshot.retention.sections}/>
                  {snapshot.pageCount>1?<div className={styles.storageActions}>{snapshot.pageIndex>0?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_retention",domain:review.domain,expectedFingerprint:review.contentFingerprint,pageIndex:snapshot.pageIndex-1})}>Previous review page</button>:null}{snapshot.pageIndex+1<snapshot.pageCount?<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"inspect_retention",domain:review.domain,expectedFingerprint:review.contentFingerprint,pageIndex:snapshot.pageIndex+1})}>Load next review page</button>:null}</div>:null}
                  {!snapshot.allPagesDelivered?<p className={styles.warning}>Load every fingerprint-bound page before final confirmation. Any record mutation makes all prior page receipts stale.</p>:null}
                  {!review.attested&&snapshot.allPagesDelivered&&<button className={styles.button} type="button" disabled={state.busy||Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"attest_retention",domain:review.domain,expectedFingerprint:review.contentFingerprint,decisionCode:review.domain==="billing"?"lawful_financial_retention_reviewed":"service_history_privacy_reviewed"})}>Confirm {review.domain==="billing"?"lawful billing retention":"privacy-safe service history"}</button>}
                </>}
              </div>}
            </li>})}</ol>
          </section>:null}
          <button className={styles.button} type="button" disabled={state.busy || Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId,{action:"prepare"})}>{state.actionRequestId===row.requestId?"Checking safely…":row.fulfillment?.state === "quiescing_storage"?"Rescan after deadline":row.fulfillment?"Run fulfillment check":"Review and fulfill"}</button>
        </li>})}
      </ol> : <div className={styles.empty}><h2>No pending requests</h2><p>No active review requests were returned by the latest successful check.</p></div>}
      <footer className={styles.pagination}>{state.hasMore ? <><span>Older requests may still be available.</span><button className={styles.button} type="button" disabled={state.busy} onClick={onMore}>{state.busy ? "Loading older requests…" : "Load older requests"}</button></> : state.requests.length > 0 ? <p>End of the loaded queue. Refresh to check for new or cancelled requests.</p> : null}</footer>
    </>}
  </section>;
}

export function AdminIntakeQueue({ auth = adminIntakeAuth }: { auth?: () => QueueAuth }) {
  const controller = useRef<ReturnType<typeof createAdminIntakeClient> | null>(null);
  const [state, setState] = useState(initialQueueState);
  useEffect(() => {
    const current = createAdminIntakeClient({ auth }); controller.current = current;
    const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [auth]);
  return <AdminIntakeQueueView state={state} onRefresh={() => { void controller.current?.refresh(); }} onMore={() => { void controller.current?.loadMore(); }} onInspectStorage={(requestId,relocationId,sourceFingerprint)=>{void controller.current?.inspectStorage(requestId,relocationId,sourceFingerprint);}} onInspectCustody={(requestId,claimId,evidenceId,objectFingerprint)=>{void controller.current?.inspectCustody(requestId,claimId,evidenceId,objectFingerprint);}} onExecute={(requestId, action={action:"prepare"}) => {
    if(action.action==="inspect_profile"||action.action==="inspect_retention"||action.action==="inspect_custody"){void controller.current?.execute(requestId,action);return;}
    if(action.action==="attest_custody_evidence"){
      const current=controller.current?.getState(),proof=current?.custodyInspection;
      if(!proof||proof.requestId!==requestId||proof.claimId!==action.claimId||proof.evidenceId!==action.evidenceId||proof.objectFingerprint!==action.expectedObjectFingerprint)return;
      if(window.confirm("Record a review receipt for these exact ownership-proof bytes? Any file or path change will make it stale."))void controller.current?.execute(requestId,action);return;
    }    if(action.action==="release_custody"){
      const current=controller.current?.getState(),snapshot=current?.reviewRequestId===requestId?current.reviewSnapshot:null;
      const evidenceCount=custodyReleaseCandidates(snapshot).find(candidate=>candidate.claimId===action.claimId)?.evidenceCount,inventory=current?.custodyEvidence;
      if(!evidenceCount||snapshot?.kind!=="profile"||snapshot.contentFingerprint!==action.expectedFingerprint||!inventory||inventory.claimId!==action.claimId
        ||inventory.profileFingerprint!==action.expectedFingerprint||inventory.evidence.length!==evidenceCount||inventory.evidence.some(item=>!item.reviewed))return;
      if(window.confirm(custodyReleasePrompt(evidenceCount)))void controller.current?.execute(requestId,action);
      return;
    }
    if(action.action==="attest_storage"){
      const current=controller.current?.getState(),inspected=current?.storageInspection;
      if(!inspected||inspected.requestId!==requestId||inspected.relocationId!==action.relocationId||inspected.sourceFingerprint!==action.expectedFingerprint)return;
      if(window.confirm(storageDecisionPrompt(action.decision)))void controller.current?.execute(requestId,action);return;
    }
    const prompt=action.action==="prepare"
      ? "Run the fail-closed deletion check? A clear first review freezes writes and hides public content for a fixed storage safety window. A later review can anonymize the account and permanently delete its sign-in identity while retaining instrument Profiles in private custody."
      : action.action==="attest_profile"
        ? "Confirm that you reviewed every section in this exact projected Profile fingerprint and that no additional departing-user personal information remains beyond the Auth UUID and current email that fulfillment removes separately?"
        : action.action==="redact_profile"
          ? `Redact ${action.terms.length} exact personal-information term${action.terms.length===1?"":"s"} across this fingerprint-bound Profile record? This changes retained history and requires another inspection.`
          : `Confirm that you reviewed this exact ${action.domain} record fingerprint and approved its privacy-safe retention?`;
    if (window.confirm(prompt)) void controller.current?.execute(requestId,action);
  }} />;
}
