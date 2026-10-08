"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { useUiText } from "./UiTextProvider";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { createServiceCorrectionClient,type CorrectionState } from "../lib/service-corrections-client";
function readableCorrectionDate(value:string,includeTime=false){
 const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+"T12:00:00":value);
 if(!Number.isFinite(date.getTime()))return value;
 return new Intl.DateTimeFormat("en-US",includeTime?{dateStyle:"medium",timeStyle:"short"}:{dateStyle:"medium"}).format(date);
}
export function ServiceCorrections({submissionId}:{submissionId:string}){
 const ui=useUiText("components.ServiceCorrections");
 const ref=useRef<ReturnType<typeof createServiceCorrectionClient>|null>(null);
 const [state,setState]=useState<CorrectionState|null>(null),[details,setDetails]=useState("");
 const [sharing,setSharing]=useState<Record<string,boolean>>({});
 useEffect(()=>{const c=createServiceCorrectionClient(submissionId,{auth:createBrowserSupabaseClient().auth});ref.current=c;
  const unsubscribe=c.subscribe(setState);setState(c.getState());void c.start();
  return()=>{unsubscribe();c.dispose();if(ref.current===c)ref.current=null;};},[submissionId]);
 useEffect(()=>{setDetails("");setSharing({});},[state?.actorId,state?.sessionRevision,submissionId]);
 const live=ref.current?.getState();
 if(!state||state.actorId!==live?.actorId||state.sessionRevision!==live?.sessionRevision)return null;
 const record=state.record,lease={actorId:state.actorId,sessionRevision:state.sessionRevision};
 const disabled=state.busy||state.uncertain||state.phase!=="ready";
 return <section className="service-form-section"><h2>{ui("ui.components.ServiceCorrections.title","Corrections to approved service work")}</h2>
  <p>{ui("ui.components.ServiceCorrections.help","The original approved record and its attachments stay unchanged. A correction is a separate dated note reviewed by the current owner. It does not record new service work.")}</p>
  {state.message&&<p role="status">{state.message}</p>}
  {state.phase==="loading"&&<p role="status">{ui("ui.components.ServiceCorrections.loading","Loading correction history…")}</p>}
  {state.phase==="signed-out"&&<p>{ui("ui.components.ServiceCorrections.signIn","Sign in to review private corrections.")}</p>}
  {state.uncertain?<button type="button" className="button secondary" disabled={state.busy} onClick={()=>void ref.current?.retry(lease)}>{ui("ui.components.ServiceCorrections.retry","Retry the same correction request")}</button>:
   state.phase==="error"&&<button type="button" className="button secondary" disabled={state.busy} onClick={()=>void ref.current?.reload()}>{ui("ui.components.ServiceCorrections.reload","Reload correction history")}</button>}
  {record&&<><div><h3>{ui("ui.components.ServiceCorrections.original","Original approved record")}</h3><strong>{record.original.title}</strong>
   <p>{ui("ui.components.ServiceCorrections.serviceDate","Recorded service date")}: {record.original.serviceDate||ui("ui.components.ServiceCorrections.unknown","Not recorded")}</p>
   <p style={{whiteSpace:"pre-wrap"}}>{record.original.details}</p>
   {record.original.partsInstalled&&<p style={{whiteSpace:"pre-wrap"}}>{record.original.partsInstalled}</p>}
   {record.original.setupMeasurements&&<p style={{whiteSpace:"pre-wrap"}}>{record.original.setupMeasurements}</p>}</div>
   {record.canPropose&&<div><label>{ui("ui.components.ServiceCorrections.note","Correction note")}<textarea value={details} maxLength={6000} disabled={disabled} rows={5} onChange={e=>setDetails(e.target.value)}/></label>
    <p>{ui("ui.components.ServiceCorrections.privateDefault","The note is private until the owner accepts it and explicitly chooses public sharing. Original evidence is read-only; this correction does not upload or replace files.")}</p>
    <button type="button" className="button" disabled={disabled||!details.trim()||record.corrections.some(c=>c.outcome==="pending")} onClick={()=>void ref.current?.act("propose",{details},lease)}>{ui("ui.components.ServiceCorrections.propose","Send correction for owner review")}</button></div>}
   <ul>{record.corrections.map(c=><li key={c.id}><p style={{whiteSpace:"pre-wrap"}}>{c.details}</p>
    <p>{ui("ui.components.ServiceCorrections.submitted","Submitted")}: <time dateTime={c.submittedAt}>{readableCorrectionDate(c.submittedAt,true)}</time></p>
    <p>{c.outcome==="pending"?ui("ui.components.ServiceCorrections.pending","Awaiting owner review"):c.outcome==="accepted"?ui("ui.components.ServiceCorrections.accepted","Accepted correction"):ui("ui.components.ServiceCorrections.rejected","Rejected correction")}
     {c.decidedAt&&<> · <time dateTime={c.decidedAt}>{readableCorrectionDate(c.decidedAt,true)}</time></>}
     {c.outcome==="accepted"&&<> · {c.isPublic?ui("ui.components.ServiceCorrections.public","Public correction"):ui("ui.components.ServiceCorrections.private","Private correction")}</>}</p>
    {record.canReview&&c.outcome==="pending"&&<div>
     <label><input type="checkbox" checked={sharing[c.id]===true} disabled={disabled||!c.canAccept} onChange={e=>setSharing({...sharing,[c.id]:e.target.checked})}/>{ui("ui.components.ServiceCorrections.share","Share this correction note on the public Profile")}</label>
     <p>{ui("ui.components.ServiceCorrections.shareHelp","Leave unchecked to keep the correction private. Sharing this note does not share the original private report or its evidence.")}</p>
     <button type="button" className="button" disabled={disabled||!c.canAccept} onClick={()=>void ref.current?.act("accept",{correctionId:c.id,sharePublicly:sharing[c.id]===true},lease)}>{ui("ui.components.ServiceCorrections.accept","Accept correction")}</button>
     <button type="button" className="button secondary" disabled={disabled||!c.canReject} onClick={()=>void ref.current?.act("reject",{correctionId:c.id,sharePublicly:false},lease)}>{ui("ui.components.ServiceCorrections.reject","Reject correction")}</button>
     {!c.canAccept&&<p>{ui("ui.components.ServiceCorrections.stale","Ownership or the original record changed. This request can be rejected; a new correction must be reviewed before acceptance.")}</p>}
    </div>}
   </li>)}</ul>
  </>}
 </section>;
}
type PublicCorrection={id:string;originalEventId:string;originalTitle:string;originalServiceDate:string|null;details:string;submittedAt:string;decidedAt:string};
export function PublicServiceCorrections({qrCode}:{qrCode:string}){
 const ui=useUiText("components.ServiceCorrections");
 const [saved,setSaved]=useState<{code:string;rows:PublicCorrection[]}|null>(null);
 useEffect(()=>{const controller=new AbortController();let live=true;
  void (async()=>{try{const response=await fetch("/api/service-corrections?qrCode="+encodeURIComponent(qrCode),{cache:"no-store",signal:controller.signal});
   const payload=await response.json();if(live&&response.ok&&payload?.ok===true&&Array.isArray(payload.corrections))setSaved({code:qrCode,rows:payload.corrections});
  }catch{if(live)setSaved(null);}})();return()=>{live=false;controller.abort();};},[qrCode]);
 if(saved?.code!==qrCode||!saved.rows.length)return null;
 return <section><h3>{ui("ui.components.ServiceCorrections.publicTitle","Owner-approved service corrections")}</h3>
  <p>{ui("ui.components.ServiceCorrections.publicHelp","These dated corrections supplement the original approved record. Correction dates do not change the recorded service date.")}</p>
  <ul>{saved.rows.map(c=><li key={c.id}><strong>{c.originalTitle}</strong>
   <p>{ui("ui.components.ServiceCorrections.serviceDate","Recorded service date")}: {c.originalServiceDate||ui("ui.components.ServiceCorrections.unknown","Not recorded")}</p>
   <p style={{whiteSpace:"pre-wrap"}}>{c.details}</p>
   <p>{ui("ui.components.ServiceCorrections.submitted","Submitted")}: <time dateTime={c.submittedAt}>{readableCorrectionDate(c.submittedAt,true)}</time> · {ui("ui.components.ServiceCorrections.accepted","Accepted correction")}: <time dateTime={c.decidedAt}>{readableCorrectionDate(c.decidedAt,true)}</time></p>
  </li>)}</ul>
 </section>;
}

export function OwnerServiceCorrectionLinks({entries}:{entries:Array<{sourceKind?:string;serviceSubmissionId?:string;title:string}>}){
 const ui=useUiText("components.ServiceCorrections");
 const seen=new Set<string>();
 const approved=entries.filter(e=>e.sourceKind==="provider_submitted_owner_approved"&&typeof e.serviceSubmissionId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(e.serviceSubmissionId)&&!seen.has(e.serviceSubmissionId)&&Boolean(seen.add(e.serviceSubmissionId)));
 if(!approved.length)return null;
 return <section><h3>{ui("ui.components.ServiceCorrections.ownerEntry","Review service corrections")}</h3><ul>{approved.map(e=><li key={e.serviceSubmissionId}><Link href={"/service-corrections/"+encodeURIComponent(e.serviceSubmissionId!)}>{ui("ui.components.ServiceCorrections.ownerEntryLabel","Review corrections for")} {e.title}</Link></li>)}</ul></section>;
}
