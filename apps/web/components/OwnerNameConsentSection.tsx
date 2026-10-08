"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useUiText } from "./UiTextProvider";
import type { IntakeAuth } from "../lib/account-deletion/deletion-intake-client";
import { cleanOwnerPublicName, createOwnerNameConsentClient, initialOwnerNameState, type OwnerNameState } from "../lib/owner-name-consent";
import styles from "./owner-name-consent.module.css";
export default function OwnerNameConsentSection({ actorId, auth }: { actorId: string; auth: () => IntakeAuth }) {
  const ui = useUiText("components.OwnerNameConsentSection"), prefix = useId(), controller = useRef<ReturnType<typeof createOwnerNameConsentClient> | null>(null);
  const [state,setState] = useState(initialOwnerNameState), expected = actorId.toLowerCase();
  const view: OwnerNameState = !expected ? { ...initialOwnerNameState(), phase:"signed-out" } : state.actorId && state.actorId !== expected ? initialOwnerNameState() : state;
  useEffect(() => {
    const current = createOwnerNameConsentClient({ actorId,auth });controller.current=current;
    const unsubscribe=current.subscribe(setState);setState(current.getState());void current.start();
    return()=>{unsubscribe();current.dispose();if(controller.current===current)controller.current=null;};
  },[actorId,auth]);
  return <section className={styles.section} aria-labelledby={prefix+"-heading"} aria-busy={view.refreshing}>
    <h2 id={prefix+"-heading"}>{ui("ui.components.OwnerNameConsentSection.heading","Your name in ownership history")}</h2>
    <p className={styles.help}>{ui("ui.components.OwnerNameConsentSection.help","Ownership history stays with the instrument. Your name is optional for each event where you were the outgoing owner and can be removed. Name sharing does not publish a private Profile.")}</p>
    {view.phase==="loading" && <p role="status">{ui("ui.components.OwnerNameConsentSection.loading","Loading your ownership events…")}</p>}
    {view.phase==="signed-out" && <p role="status">{ui("ui.components.OwnerNameConsentSection.signedOut","Sign in to manage your own name settings.")}</p>}
    {view.phase==="account-changed" && <p role="status">{ui("ui.components.OwnerNameConsentSection.changed","Your signed-in account changed. Open the current Account page before continuing.")}</p>}
    {view.error && <p role="alert" className={styles.error}>{view.error}</p>}
    {view.actorId===expected && view.phase==="ready" && !view.rows.length && <p>{ui("ui.components.OwnerNameConsentSection.empty","There are no ownership changes where you can share your name.")}</p>}
    {view.actorId===expected && view.rows.map(row=>{
      const item=row.confirmed,id=prefix+"-"+item.eventId,dirty=row.draftEnabled!==item.enabled || row.draftName!==(item.publicName??""),canSave=row.certainty==="confirmed"&&!row.pending&&row.draftEnabled&&!!cleanOwnerPublicName(row.draftName)&&dirty;
      return <div key={item.eventId} className={styles.row} aria-busy={Boolean(row.pending)}>
        <h3 className={styles.reference}>{item.reference}</h3>
        <p className={styles.date}>{item.eventDate ? <time dateTime={item.eventDate}>{item.eventDate}</time> : ui("ui.components.OwnerNameConsentSection.noDate","Date not recorded")}</p>
        <label className={styles.check} htmlFor={id+"-enabled"}><input id={id+"-enabled"} type="checkbox" checked={row.draftEnabled} onChange={e=>controller.current?.edit(item.eventId,{enabled:e.target.checked})}/>{ui("ui.components.OwnerNameConsentSection.checkbox","Show my name beside this ownership event")}</label>
        <label className={styles.field} htmlFor={id+"-name"}>{ui("ui.components.OwnerNameConsentSection.name","Name to show publicly")}<input id={id+"-name"} type="text" autoComplete="off" maxLength={80} value={row.draftName} disabled={!row.draftEnabled} onChange={e=>controller.current?.edit(item.eventId,{name:e.target.value})}/></label>
        <div className={styles.actions}><button type="button" disabled={!canSave} onClick={()=>void controller.current?.save(item.eventId)}>{ui("ui.components.OwnerNameConsentSection.save","Save public name")}</button>
          <button type="button" disabled={row.pending==="remove"} onClick={()=>void controller.current?.remove(item.eventId)}>{ui("ui.components.OwnerNameConsentSection.remove","Remove public name")}</button></div>
        <p className={styles.status} role="status" aria-live="polite">{row.pending ? ui("ui.components.OwnerNameConsentSection.pending","Updating this event…")
          : row.certainty==="unknown" ? ui("ui.components.OwnerNameConsentSection.unknown","Saved setting not confirmed. Reload before saving a public name.")
          : dirty ? ui("ui.components.OwnerNameConsentSection.unsaved","Unsaved changes. The last confirmed setting still applies. To withdraw a saved name, choose Remove public name.")
          : item.enabled ? ui("ui.components.OwnerNameConsentSection.on","Saved: public name enabled for this event.") : ui("ui.components.OwnerNameConsentSection.off","Saved: public name disabled for this event.")}</p>
        {row.error && <p className={styles.error} role="alert">{row.error}</p>}
      </div>;
    })}
    {view.actorId===expected && view.nextCursor && <div className={styles.actions}><button type="button" disabled={view.refreshing||view.rows.some(r=>r.pending)} onClick={()=>void controller.current?.loadMore()}>{ui("ui.components.OwnerNameConsentSection.more","Load more ownership events")}</button></div>}
    {(view.actorId===expected || view.phase==="error") && <button type="button" className={styles.reload} disabled={view.refreshing||view.rows.some(r=>r.pending)} onClick={()=>void controller.current?.reload()}>{ui("ui.components.OwnerNameConsentSection.reload","Reload saved name setting")}</button>}
  </section>;
}

