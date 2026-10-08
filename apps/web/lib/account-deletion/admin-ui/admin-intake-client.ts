export type QueueSession = { access_token: string; user: { id: string } } | null;
export type QueueAuth = {
  getSession(): Promise<{ data: { session: QueueSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: QueueSession) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type QueueFulfillment = { state: "blocked" | "quiescing_storage" | "ready_for_auth_deletion" | "completed"; blockers: string[]; revision: string; reviewedAt: string; storageQuiesceUntil: string | null };
export type QueueProfileReview = { guitarId: string; qrCode: string; permanentPath: string; relationshipCodes: string[]; policyVersion: 1; contentFingerprint: string; attested: boolean; attestedAt: string | null };
export type QueueRetentionReview = { domain: "billing" | "service"; policyVersion: 1; contentFingerprint: string; required: boolean; decisionCode: "lawful_financial_retention_reviewed" | "service_history_privacy_reviewed" | null; attested: boolean; attestedAt: string | null };
export type QueueStorageReview = { relocationId:string; bucket:"instrument-media"|"instrument-documents"|"service-evidence";
  disposition:"retain"|"delete"; sourceSize:number|null; sourceMimeType:string|null; sourceFingerprint:string;
  reviewRequired:boolean; decision:"retain"|"delete"|null; byteSha256:string|null; reviewedAt:string|null;
  state:"planned"|"copy_authorized"|"deletion_authorized"|"references_updated" };
export type QueueStorageInspection = { requestId:string; relocationId:string; sourceFingerprint:string; mimeType:string; byteSize:number; objectUrl:string; structureValid:boolean; metadataFindings:string[]; safeToRetain:boolean };
export type QueueCustodyEvidenceItem={evidenceId:string;objectFingerprint:string;byteSize:number;mimeType:string;reviewed:boolean;byteSha256:string|null;reviewedAt:string|null};
export type QueueCustodyEvidence={claimId:string;guitarId:string;profileFingerprint:string;inventoryFingerprint:string;pageIndex:number;pageCount:number;evidenceCount:number;reviewedCount:number;evidence:QueueCustodyEvidenceItem[]};
export type QueueCustodyInspection={requestId:string;claimId:string;evidenceId:string;objectFingerprint:string;mimeType:string;byteSize:number;objectUrl:string};
export type QueueReviewJson = null | boolean | number | string | QueueReviewJson[] | { [key:string]: QueueReviewJson };
export type QueueReviewSection = { code:string; label:string; recordCount:number; contentDigest:string; records:QueueReviewJson[] };
export type QueueReviewSnapshot =
  | { kind:"profile"; policyVersion:1; contentFingerprint:string; truncated:boolean; pageIndex:number; pageCount:number; pageDigest:string; deliveredPages:number; allPagesDelivered:boolean; profile:{ guitarId:string; qrCode:string; relationshipCodes:string[]; sections:QueueReviewSection[] } }
  | { kind:"retention"; policyVersion:1; contentFingerprint:string; truncated:boolean; pageIndex:number; pageCount:number; pageDigest:string; deliveredPages:number; allPagesDelivered:boolean; retention:{ domain:"billing"|"service"; sections:QueueReviewSection[] } };
export type QueueRequest = { requestId: string; actorId: string | null; status: "requested"; requestedAt: string; cancelledAt: null; fulfillment?: QueueFulfillment; profileReviews: QueueProfileReview[]; retentionReviews: QueueRetentionReview[]; storageReviews:QueueStorageReview[] };
export type QueueAction = { action: "prepare" } | { action: "attest_profile"; guitarId: string; expectedFingerprint: string }
  | { action: "attest_retention"; domain: "billing" | "service"; expectedFingerprint: string; decisionCode: "lawful_financial_retention_reviewed" | "service_history_privacy_reviewed" }
  | { action:"inspect_profile"; guitarId:string; expectedFingerprint:string; pageIndex:number }
  | { action:"inspect_retention"; domain:"billing"|"service"; expectedFingerprint:string; pageIndex:number }
  | { action:"redact_profile"; guitarId:string; expectedFingerprint:string; terms:string[] }
  | { action:"attest_storage"; relocationId:string; expectedFingerprint:string; decision:"retain"|"delete" }
  | { action:"inspect_custody"; claimId:string; expectedFingerprint:string; pageIndex:number }
  | { action:"attest_custody_evidence"; claimId:string; evidenceId:string; expectedFingerprint:string; expectedObjectFingerprint:string; pageIndex:number }
  | { action:"release_custody"; claimId:string; expectedFingerprint:string };
export type QueueCursor = { requestedAt: string; requestId: string };
export type QueueState = {
  phase: "loading" | "ready" | "error" | "signed-out" | "forbidden";
  actorId: string; requests: QueueRequest[]; busy: boolean; actionRequestId: string; actionMessage: string; actionError: string;
  hasMore: boolean; cursor: QueueCursor | null; error: string; reviewRequestId:string; reviewSnapshot:QueueReviewSnapshot|null;
  storageInspection:QueueStorageInspection|null; custodyEvidence:QueueCustodyEvidence|null; custodyInspection:QueueCustodyInspection|null;
};
export const initialQueueState = (): QueueState => ({ phase: "loading", actorId: "", requests: [], busy: false, actionRequestId: "", actionMessage: "", actionError: "", hasMore: false, cursor: null, error: "", reviewRequestId:"", reviewSnapshot:null,storageInspection:null,custodyEvidence:null,custodyInspection:null });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function readSession(value: unknown): QueueSession {
  if (value === null) return null;
  if (!object(value) || !object(value.user) || !uuid(value.user.id) || typeof value.access_token !== "string" || !value.access_token.trim()) throw new Error("Invalid session result");
  return { access_token: value.access_token, user: { id: value.user.id.toLowerCase() } };
}
function validTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60 && second < 60;
}
function micros(value: string) { return BigInt(Date.parse(value.replace(/\.\d+/, ""))) * 1000n + BigInt((/\.(\d+)/.exec(value)?.[1] || "").padEnd(6, "0")); }
function older(row: QueueCursor, before: QueueCursor) {
  const left = micros(row.requestedAt), right = micros(before.requestedAt);
  return left < right || (left === right && row.requestId < before.requestId);
}
const blockerCodes = new Set(["administrator_account", "unused_paid_credits", "unresolved_payment_order", "payment_hold_or_dispute", "billing_retention_review_required", "unused_profile_credits", "storage_cleanup_required", "storage_quiescence_required", "active_ownership_transfer", "active_ownership_claim", "active_service_workflow", "service_history_privacy_review_required", "profile_history_privacy_review_required", "retained_personal_content_review_required"]);
const relationCodes = new Set(["current_owner", "safety_author", "owner_removal_author", "archive_author", "transfer_from_owner", "transfer_recipient", "claim_participant", "claim_evidence_author", "claim_event_author", "document_author", "external_media_author", "serial_author", "timeline_author", "service_access", "service_participant", "service_evidence_author", "service_activity_author", "service_notification_recipient", "service_upload_author", "service_upload_scope", "service_discard_receipt", "create_receipt", "staged_upload", "site_content", "document_custodian", "claim_previous_owner", "owner_name_consent"]);
const profileSections=new Set(["guitar","redirects","specs","media","documents","documentSelections","externalMedia","serialAliases","timeline","transfers","claims","claimEvidence","claimEvents","serviceAccess","serviceSubmissions","serviceEvidence","serviceTokens","serviceActivity","serviceNotifications","serviceCorrections","serviceCorrectionDecisions","serviceUploads","serviceUploadScopes","serviceDiscardReceipts","createReceipts","stagedUploads","siteContent","ownerNameConsents"]);
const retentionSections={billing:new Set(["customers","orders","receipts","grants","consumptions","holds","decisions","promotions","directOrders","directClaims","directPayments","providerReferences","paypalOrders","paypalBindings","webhookDeliveries","webhookPayloads","webhookOutcomes","webhookActions"]),service:new Set(["submissions","evidence","uploads","discards","activity","timeline","corrections","correctionDecisions"])};
const forbiddenReviewKeys=new Set(["authActorId","owner_id","subject_id","operator_id","operator_subject_id","provider_user_id","provider_subject_id","owner_user_id","owner_subject_id","uploaded_by_user_id","uploaded_by_subject_id","actor_user_id","actor_subject_id","actor_id","created_by_user_id","created_by_subject_id","evidence_reviewed_by","evidence_reviewed_by_subject_id","recipient_user_id","storage_path","evidence_result","ownerScope"]);
const storageMimes={"instrument-media":new Set(["image/jpeg","image/png","image/webp"]),"instrument-documents":new Set(["image/jpeg","image/png","image/webp","application/pdf"]),"service-evidence":new Set(["image/jpeg","image/png","image/webp","application/pdf"])} as const;
const fingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
function fulfillment(value: unknown): QueueFulfillment | undefined {
  if (value === undefined || value === null) return undefined;
  if (!object(value) || !["blocked","quiescing_storage","ready_for_auth_deletion","completed"].includes(String(value.state)) || !Array.isArray(value.blockers)
    || value.blockers.some(code => typeof code !== "string" || !blockerCodes.has(code)) || new Set(value.blockers).size !== value.blockers.length
    || typeof value.revision !== "string" || !/^(?:0|[1-9][0-9]{0,18})$/.test(value.revision) || !validTime(value.reviewedAt)
    || (value.storageQuiesceUntil !== null && !validTime(value.storageQuiesceUntil))
    || (((value.state === "blocked" || value.state === "quiescing_storage") !== (value.blockers.length > 0))
      || (value.state === "blocked" && value.storageQuiesceUntil !== null)
      || (value.state !== "blocked" && value.storageQuiesceUntil === null))) throw new Error("Invalid fulfillment status");
  return { state:value.state as QueueFulfillment["state"], blockers:[...value.blockers], revision:value.revision, reviewedAt:value.reviewedAt,
    storageQuiesceUntil:value.storageQuiesceUntil as string|null };
}
function profileReview(value: unknown): QueueProfileReview {
  if (!exact(value,["guitarId","qrCode","permanentPath","relationshipCodes","policyVersion","contentFingerprint","attested","attestedAt"])
    || !uuid(value.guitarId) || typeof value.qrCode!=="string" || !value.qrCode || value.qrCode.length>200
    || typeof value.permanentPath!=="string" || !value.permanentPath.startsWith("/i/") || value.permanentPath.length>500
    || !Array.isArray(value.relationshipCodes) || value.relationshipCodes.length<1 || value.relationshipCodes.length>32
    || value.relationshipCodes.some(code=>typeof code!=="string"||!relationCodes.has(code)) || new Set(value.relationshipCodes).size!==value.relationshipCodes.length
    || value.policyVersion!==1 || !fingerprint(value.contentFingerprint) || typeof value.attested!=="boolean"
    || (value.attestedAt!==null&&!validTime(value.attestedAt)) || value.attested!==(value.attestedAt!==null)) throw new Error("Invalid Profile review");
  return {guitarId:value.guitarId.toLowerCase(),qrCode:value.qrCode,permanentPath:value.permanentPath,relationshipCodes:[...value.relationshipCodes],policyVersion:1,
    contentFingerprint:value.contentFingerprint,attested:value.attested,attestedAt:value.attestedAt as string|null};
}
function retentionReview(value: unknown): QueueRetentionReview {
  if (!exact(value,["domain","policyVersion","contentFingerprint","required","decisionCode","attested","attestedAt"])
    || !["billing","service"].includes(String(value.domain)) || value.policyVersion!==1 || !fingerprint(value.contentFingerprint)
    || typeof value.required!=="boolean" || typeof value.attested!=="boolean" || (value.attestedAt!==null&&!validTime(value.attestedAt))) throw new Error("Invalid retention review");
  const domain=value.domain as "billing"|"service",decision=domain==="billing"?"lawful_financial_retention_reviewed":"service_history_privacy_reviewed";
  if((!value.required&&value.attested)||value.attested!==(value.attestedAt!==null)||(value.attested?value.decisionCode!==decision:value.decisionCode!==null))throw new Error("Invalid retention review");
  return {domain,policyVersion:1,contentFingerprint:value.contentFingerprint,required:value.required,decisionCode:value.decisionCode as QueueRetentionReview["decisionCode"],attested:value.attested,attestedAt:value.attestedAt as string|null};
}
function storageReview(value:unknown):QueueStorageReview{
  if(!exact(value,["relocationId","bucket","disposition","sourceSize","sourceMimeType","sourceFingerprint","reviewRequired","decision","byteSha256","reviewedAt","state"])
    ||!uuid(value.relocationId)||!Object.hasOwn(storageMimes,String(value.bucket))||!["retain","delete"].includes(String(value.disposition))
    ||(value.sourceSize!==null&&(!Number.isSafeInteger(value.sourceSize)||Number(value.sourceSize)<0||Number(value.sourceSize)>16*1024*1024))
    ||(value.sourceMimeType!==null&&(typeof value.sourceMimeType!=="string"||!storageMimes[value.bucket as keyof typeof storageMimes].has(value.sourceMimeType as never)))
    ||!fingerprint(value.sourceFingerprint)||typeof value.reviewRequired!=="boolean"||![null,"retain","delete"].includes(value.decision as null|string)
    ||(value.byteSha256!==null&&!fingerprint(value.byteSha256))||(value.reviewedAt!==null&&!validTime(value.reviewedAt))
    ||!["planned","copy_authorized","deletion_authorized","references_updated"].includes(String(value.state)))throw new Error("Invalid Storage review");
  const decision=value.decision as "retain"|"delete"|null;
  if((decision===null)!==(value.byteSha256===null)||(decision===null)!==(value.reviewedAt===null)||value.reviewRequired!==(value.disposition==="retain")
    ||(decision!==null&&decision!==value.disposition)||(value.state==="copy_authorized"&&(value.disposition!=="retain"||decision!=="retain"))
    ||(value.state==="deletion_authorized"&&value.disposition!=="delete")||(value.state==="references_updated"&&(value.disposition!=="retain"||decision!=="retain")))throw new Error("Invalid Storage review");
  return{relocationId:value.relocationId.toLowerCase(),bucket:value.bucket as QueueStorageReview["bucket"],disposition:value.disposition as "retain"|"delete",
    sourceSize:value.sourceSize as number|null,sourceMimeType:value.sourceMimeType as string|null,sourceFingerprint:value.sourceFingerprint,
    reviewRequired:value.reviewRequired,decision,byteSha256:value.byteSha256 as string|null,reviewedAt:value.reviewedAt as string|null,state:value.state as QueueStorageReview["state"]};
}
function reviewJson(value:unknown,budget:{nodes:number},depth=0):QueueReviewJson{
  if(++budget.nodes>50_000||depth>12)throw new Error("Invalid review snapshot");
  if(value===null||typeof value==="boolean"||typeof value==="string")return value;
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(item=>reviewJson(item,budget,depth+1));
  if(!object(value))throw new Error("Invalid review snapshot");const result:{[key:string]:QueueReviewJson}={};
  for(const [key,item] of Object.entries(value)){if(!key||key.length>120||forbiddenReviewKeys.has(key)||/(^|_)(token|secret|signature|hash)(_|$)/i.test(key))throw new Error("Invalid review snapshot");result[key]=reviewJson(item,budget,depth+1);}return result;
}
function reviewSections(value:unknown,expected:Set<string>,truncated:boolean,pageCount=1):QueueReviewSection[]{
  if(!Array.isArray(value)||value.length!==expected.size)throw new Error("Invalid review snapshot");const seen=new Set<string>(),budget={nodes:0};let total=0;
  const sections=value.map(section=>{if(!exact(section,["code","label","recordCount","contentDigest","records"])||typeof section.code!=="string"||!expected.has(section.code)||seen.has(section.code)||typeof section.label!=="string"||!section.label||section.label.length>100||!Number.isInteger(section.recordCount)||Number(section.recordCount)<0||Number(section.recordCount)>1_000_000||!fingerprint(section.contentDigest)||!Array.isArray(section.records))throw new Error("Invalid review snapshot");seen.add(section.code);total+=Number(section.recordCount);if((truncated&&section.records.length!==0)||(!truncated&&(section.records.length>Number(section.recordCount)||(pageCount===1&&section.records.length!==Number(section.recordCount)))))throw new Error("Invalid review snapshot");return{code:section.code,label:section.label,recordCount:Number(section.recordCount),contentDigest:section.contentDigest,records:section.records.map(record=>reviewJson(record,budget))};});
  if([...expected].some(code=>!seen.has(code))||(!truncated&&pageCount===1&&total>500))throw new Error("Invalid review snapshot");return sections;
}
function reviewSnapshot(value:unknown):QueueReviewSnapshot{
  if(!object(value)||value.policyVersion!==1||!fingerprint(value.contentFingerprint)||typeof value.truncated!=="boolean"
    ||!Number.isInteger(value.pageIndex)||Number(value.pageIndex)<0||!Number.isInteger(value.pageCount)||Number(value.pageCount)<1||Number(value.pageCount)>20_000||Number(value.pageIndex)>=Number(value.pageCount)
    ||!fingerprint(value.pageDigest)||!Number.isInteger(value.deliveredPages)||Number(value.deliveredPages)<1||Number(value.deliveredPages)>Number(value.pageCount)
    ||typeof value.allPagesDelivered!=="boolean"||value.allPagesDelivered!==(value.deliveredPages===value.pageCount))throw new Error("Invalid review snapshot");
  const page={pageIndex:Number(value.pageIndex),pageCount:Number(value.pageCount),pageDigest:value.pageDigest,deliveredPages:Number(value.deliveredPages),allPagesDelivered:value.allPagesDelivered};
  if(value.kind==="profile"&&exact(value,["kind","policyVersion","contentFingerprint","truncated","pageIndex","pageCount","pageDigest","deliveredPages","allPagesDelivered","profile"])&&exact(value.profile,["guitarId","qrCode","relationshipCodes","sections"])&&uuid(value.profile.guitarId)&&typeof value.profile.qrCode==="string"&&Boolean(value.profile.qrCode)&&value.profile.qrCode.length<=200&&Array.isArray(value.profile.relationshipCodes)&&value.profile.relationshipCodes.length>=1&&value.profile.relationshipCodes.length<=32&&!value.profile.relationshipCodes.some(code=>typeof code!=="string"||!relationCodes.has(code))&&new Set(value.profile.relationshipCodes).size===value.profile.relationshipCodes.length)return{kind:"profile",policyVersion:1,contentFingerprint:value.contentFingerprint,truncated:value.truncated,...page,profile:{guitarId:value.profile.guitarId.toLowerCase(),qrCode:value.profile.qrCode,relationshipCodes:[...value.profile.relationshipCodes],sections:reviewSections(value.profile.sections,profileSections,value.truncated,page.pageCount)}};
  if(value.kind==="retention"&&exact(value,["kind","policyVersion","contentFingerprint","truncated","pageIndex","pageCount","pageDigest","deliveredPages","allPagesDelivered","retention"])&&exact(value.retention,["domain","sections"])&&(value.retention.domain==="billing"||value.retention.domain==="service"))return{kind:"retention",policyVersion:1,contentFingerprint:value.contentFingerprint,truncated:value.truncated,...page,retention:{domain:value.retention.domain,sections:reviewSections(value.retention.sections,retentionSections[value.retention.domain],value.truncated,page.pageCount)}};
  throw new Error("Invalid review snapshot");
}
function custodyEvidence(value:unknown):QueueCustodyEvidence{
  if(!exact(value,["claimId","guitarId","profileFingerprint","inventoryFingerprint","pageIndex","pageCount","evidenceCount","reviewedCount","evidence"])||!uuid(value.claimId)||!uuid(value.guitarId)||!fingerprint(value.profileFingerprint)||!fingerprint(value.inventoryFingerprint)
    ||!Number.isInteger(value.pageIndex)||Number(value.pageIndex)<0||!Number.isInteger(value.pageCount)||Number(value.pageCount)<1||Number(value.pageIndex)>=Number(value.pageCount)
    ||!Number.isInteger(value.evidenceCount)||Number(value.evidenceCount)<1||!Number.isInteger(value.reviewedCount)||Number(value.reviewedCount)<0||Number(value.reviewedCount)>Number(value.evidenceCount)
    ||!Array.isArray(value.evidence)||value.evidence.length<1||value.evidence.length>32)throw new Error("Invalid custody evidence");
  const rows=value.evidence.map(item=>{if(!exact(item,["evidenceId","objectFingerprint","byteSize","mimeType","reviewed","byteSha256","reviewedAt"])
      ||!uuid(item.evidenceId)||!fingerprint(item.objectFingerprint)||!Number.isSafeInteger(item.byteSize)||Number(item.byteSize)<1||Number(item.byteSize)>16*1024*1024
      ||!storageMimes["instrument-documents"].has(item.mimeType as never)||typeof item.reviewed!=="boolean"
      ||(item.byteSha256!==null&&!fingerprint(item.byteSha256))||(item.reviewedAt!==null&&!validTime(item.reviewedAt))
      ||item.reviewed!==(item.byteSha256!==null)||item.reviewed!==(item.reviewedAt!==null))throw new Error("Invalid custody evidence");
    return{evidenceId:item.evidenceId.toLowerCase(),objectFingerprint:item.objectFingerprint,byteSize:Number(item.byteSize),mimeType:item.mimeType as string,
      reviewed:item.reviewed,byteSha256:item.byteSha256 as string|null,reviewedAt:item.reviewedAt as string|null};});
  if(new Set(rows.map(item=>item.evidenceId)).size!==rows.length||Number(value.evidenceCount)>Number(value.pageCount)*32||Number(value.evidenceCount)<=(Number(value.pageCount)-1)*32)throw new Error("Invalid custody evidence");
  return{claimId:value.claimId.toLowerCase(),guitarId:value.guitarId.toLowerCase(),profileFingerprint:value.profileFingerprint,inventoryFingerprint:value.inventoryFingerprint,pageIndex:Number(value.pageIndex),pageCount:Number(value.pageCount),evidenceCount:Number(value.evidenceCount),reviewedCount:Number(value.reviewedCount),evidence:rows};
}
function fulfillmentResult(value:unknown){
  const hasSnapshot=object(value)&&Object.hasOwn(value,"reviewSnapshot"),hasCustody=object(value)&&Object.hasOwn(value,"custodyEvidence");
  const keys=["ok","fulfillment","profileReviews","retentionReviews","storageReviews",...(hasSnapshot?["reviewSnapshot"]:[]),...(hasCustody?["custodyEvidence"]:[])];
  if(!exact(value,keys)||value.ok!==true||!object(value.fulfillment)
    || !Array.isArray(value.profileReviews)||!Array.isArray(value.retentionReviews)||value.retentionReviews.length>2||!Array.isArray(value.storageReviews)||value.storageReviews.length>10_000)throw new Error("Invalid fulfillment response");
  const status=fulfillment(value.fulfillment);if(!status)throw new Error("Invalid fulfillment response");
  const profiles=value.profileReviews.map(profileReview),retention=value.retentionReviews.map(retentionReview),storage=value.storageReviews.map(storageReview);
  if(new Set(profiles.map(row=>row.guitarId)).size!==profiles.length||new Set(retention.map(row=>row.domain)).size!==retention.length||new Set(storage.map(row=>row.relocationId)).size!==storage.length)throw new Error("Invalid fulfillment response");
  return {fulfillment:status,profileReviews:profiles,retentionReviews:retention,storageReviews:storage,...(hasSnapshot?{reviewSnapshot:reviewSnapshot(value.reviewSnapshot)}:{}),...(hasCustody?{custodyEvidence:custodyEvidence(value.custodyEvidence)}:{})};
}
function page(value: unknown, limit: number, cursor: QueueCursor | null, existing: QueueRequest[]) {
  if (!object(value) || value.ok !== true || !Array.isArray(value.requests) || value.requests.length > limit) throw new Error("Invalid queue response");
  const seen = new Set(existing.map(row => row.requestId)); let before = cursor;
  return value.requests.map(value => {
    if (!object(value) || !uuid(value.requestId) || (value.actorId !== null && !uuid(value.actorId)) || value.status !== "requested" || value.cancelledAt !== null || !validTime(value.requestedAt)
      || !Array.isArray(value.profileReviews) || !Array.isArray(value.retentionReviews) || value.retentionReviews.length>2
      || !Array.isArray(value.storageReviews) || value.storageReviews.length>10_000) throw new Error("Invalid queue item");
    const status=fulfillment(value.fulfillment);
    const profiles=value.profileReviews.map(profileReview),retention=value.retentionReviews.map(retentionReview),storage=value.storageReviews.map(storageReview);
    if(new Set(profiles.map(row=>row.guitarId)).size!==profiles.length||new Set(retention.map(row=>row.domain)).size!==retention.length||new Set(storage.map(row=>row.relocationId)).size!==storage.length)throw new Error("Invalid queue item");
    const row: QueueRequest = { requestId: value.requestId.toLowerCase(), actorId: typeof value.actorId === "string" ? value.actorId.toLowerCase() : null, status: "requested", requestedAt: value.requestedAt, cancelledAt: null, profileReviews:profiles, retentionReviews:retention, storageReviews:storage, ...(status ? {fulfillment:status} : {}) };
    if (seen.has(row.requestId) || (before && !older(row, before))) throw new Error("Invalid queue cursor order");
    seen.add(row.requestId); before = row; return row;
  });
}
class Stale extends Error {}
class Denied extends Error { constructor(readonly status: 401 | 403) { super("Queue access denied"); } }

/** Admin queue controller. The server verifies the bearer and administrator authority for every read and mutation. */
export function createAdminIntakeClient(deps: { auth: () => QueueAuth; fetch?: typeof fetch; timeoutMs?: number; pageSize?: number;
  createObjectUrl?:(blob:Blob)=>string; revokeObjectUrl?:(url:string)=>void }) {
  const transport = deps.fetch || fetch, limit = deps.pageSize ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid queue page size");
  const timeout = Math.max(1, Math.min(deps.timeoutMs ?? 15000, 30000));
  let state = initialQueueState(), actor = "", observed = false, authRevision = 0, workRevision = 0, disposed = false, started = false;
  let auth: QueueAuth | undefined, unsubscribe: (() => void) | undefined;
  const listeners = new Set<(state: QueueState) => void>(), pending = new Set<AbortController>(), operationIds = new Map<string,string>();
  const createObjectUrl=deps.createObjectUrl||((blob:Blob)=>URL.createObjectURL(blob)),revokeObjectUrl=deps.revokeObjectUrl||((url:string)=>URL.revokeObjectURL(url));
  function publish(patch: Partial<QueueState>) { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } }
  function clearStorageInspection(){const current=state.storageInspection;if(current){try{revokeObjectUrl(current.objectUrl);}catch{/* best-effort memory release */}}return null;}
  function clearCustodyInspection(){const current=state.custodyInspection;if(current){try{revokeObjectUrl(current.objectUrl);}catch{/* best-effort memory release */}}return null;}
  function abort() { pending.forEach(controller => controller.abort()); pending.clear(); }
  const live = (authLease: number, workLease: number) => !disposed && authRevision === authLease && workRevision === workLease;
  function check(authLease: number, workLease: number) { if (!live(authLease, workLease)) throw new Stale(); }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Stale()), { once: true });
      timer = setTimeout(() => { reject(new Error("Queue check timed out")); controller.abort(); }, timeout);
    });
    try { return await Promise.race([Promise.resolve().then(() => run(controller.signal)), stopped]); }
    finally { if (timer) clearTimeout(timer); pending.delete(controller); }
  }
  function observe(session: QueueSession, schedule = true) {
    if (disposed) return;
    let parsed: QueueSession;
    try { parsed = readSession(session); } catch { authRevision++; workRevision++; abort(); publish({ ...initialQueueState(), phase: "error", error: "The admin session could not be verified. Refresh to try again." }); return; }
    const next = parsed?.user.id || "";
    if (observed && next === actor) return;
    observed = true; actor = next; authRevision++; workRevision++; abort(); operationIds.clear();clearStorageInspection();
    publish({ ...initialQueueState(), actorId: actor, phase: actor ? "loading" : "signed-out" });
    // Supabase auth callbacks must return before calling getSession again.
    if (actor && schedule) queueMicrotask(() => { if (!disposed && actor === next) void load(false); });
  }
  async function load(more: boolean) {
    if (disposed || !auth) return;
    if (more && (state.busy || !state.hasMore || !state.cursor || !actor)) return;
    const cursor = more ? state.cursor : null, existing = more ? state.requests : [];
    const authLease = authRevision, workLease = ++workRevision; abort();
    clearStorageInspection();publish({ busy: true, error: "", reviewRequestId:"", reviewSnapshot:null,storageInspection:null, ...(more ? {} : { phase: "loading", requests: [], hasMore: false, cursor: null }) });
    try {
      const result = await bounded(() => auth!.getSession()); check(authLease, workLease);
      if (!result || result.error || !result.data) throw new Error("Session check unavailable");
      const session = readSession(result.data.session);
      const current = session?.user.id || "";
      if (current !== actor || !observed) { observe(session); return; }
      if (!current || !session?.access_token) { publish({ ...initialQueueState(), phase: "signed-out" }); return; }
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) { query.set("beforeRequestedAt", cursor.requestedAt); query.set("beforeId", cursor.requestId); }
      const payload = await bounded(async signal => {
        const response = await transport(`/api/admin/account-deletion-requests?${query}`, { method: "GET", cache: "no-store", credentials: "omit", redirect: "error", headers: { authorization: `Bearer ${session.access_token}` }, signal });
        if (response.status === 401 || response.status === 403) throw new Denied(response.status);
        if (!response.ok) throw new Error("Queue unavailable");
        return response.json();
      });
      check(authLease, workLease);
      // A storage/session change can precede its auth event. Recheck after the
      // entire response body before publishing this administrator's private data.
      const finalAuth = await bounded(() => auth!.getSession()); check(authLease, workLease);
      if (!finalAuth || finalAuth.error || !finalAuth.data) throw new Error("Session check unavailable");
      const finalSession = readSession(finalAuth.data.session);
      if ((finalSession?.user.id || "") !== actor) { observe(finalSession); return; }
      const rows = page(payload, limit, cursor, existing), last = rows.at(-1);
      publish({ phase: "ready", actorId: actor, requests: [...existing, ...rows], busy: false, error: "", hasMore: rows.length === limit, cursor: last ? { requestedAt: last.requestedAt, requestId: last.requestId } : cursor });
    } catch (error) {
      if (!live(authLease, workLease) || error instanceof Stale) return;
      if (error instanceof Denied) {
        publish({ ...initialQueueState(), actorId: actor, phase: error.status === 403 ? "forbidden" : "signed-out" });
      } else {
        // Retain neither unverified private rows nor a misleading empty success.
        publish({ phase: "error", busy: false, requests: [], hasMore: false, cursor: null,
          error: "The request queue could not be verified. Refresh to try again; this does not mean the queue is empty." });
      }
    }
  }
  async function inspectStorage(requestId:string,relocationId:string,sourceFingerprint:string){
    if(disposed||!auth||state.busy||state.actionRequestId||!uuid(requestId)||!uuid(relocationId)||!fingerprint(sourceFingerprint)||!actor)return;
    const row=state.requests.find(item=>item.requestId===requestId)?.storageReviews.find(item=>item.relocationId===relocationId);
    if(!row||row.sourceFingerprint!==sourceFingerprint||row.disposition!=="retain"||row.decision!==null||row.state!=="planned")return;
    const authLease=authRevision,workLease=++workRevision;abort();clearStorageInspection();publish({storageInspection:null,actionRequestId:requestId,actionMessage:"",actionError:""});
    let created="";
    try{
      const result=await bounded(()=>auth!.getSession());check(authLease,workLease);
      if(!result||result.error||!result.data)throw new Error("Session check unavailable");
      const session=readSession(result.data.session);if(!session||session.user.id!==actor)throw new Denied(401);
      const url=`/api/admin/account-deletion-requests/${encodeURIComponent(requestId)}/storage-review/${encodeURIComponent(relocationId)}?fingerprint=${encodeURIComponent(sourceFingerprint)}`;
      const response=await bounded(signal=>transport(url,{method:"GET",cache:"no-store",credentials:"omit",redirect:"error",headers:{authorization:`Bearer ${session.access_token}`},signal}));check(authLease,workLease);
      if(response.status===401||response.status===403)throw new Denied(response.status);if(!response.ok)throw new Error("Storage review unavailable");
      const mimeType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase(),length=response.headers.get("content-length"),structure=response.headers.get("x-qr-content-structure"),metadata=(response.headers.get("x-qr-hidden-metadata")||"").split(",").filter(Boolean);
      if(!["valid","malformed"].includes(structure||"")||metadata.some(item=>!["exif","xmp","iptc","comment","text-metadata","iccp","document-properties","active-content","embedded-files","malformed-container"].includes(item))
        ||(structure==="malformed")!==metadata.includes("malformed-container")||!Object.hasOwn(storageMimes,row.bucket)||!storageMimes[row.bucket].has(mimeType as never)||!length||!/^\d+$/.test(length)
        ||Number(length)<1||Number(length)>16*1024*1024||!response.headers.get("content-disposition")?.startsWith("inline; filename=\"private-storage-review."))throw new Error("Invalid Storage review response");
      const blob=await bounded(()=>response.blob());check(authLease,workLease);
      if(blob.size!==Number(length)||blob.type!==mimeType)throw new Error("Invalid Storage review response");
      const finalAuth=await bounded(()=>auth!.getSession());check(authLease,workLease);const finalSession=readSession(finalAuth.data.session);
      if(!finalSession||finalSession.user.id!==actor)throw new Denied(401);
      created=createObjectUrl(blob);if(!created||typeof created!=="string")throw new Error("Storage preview unavailable");check(authLease,workLease);
      publish({storageInspection:{requestId,relocationId,sourceFingerprint,mimeType,byteSize:blob.size,objectUrl:created,structureValid:structure==="valid",metadataFindings:metadata,safeToRetain:structure==="valid"&&metadata.length===0},actionRequestId:"",actionMessage:structure==="valid"&&metadata.length===0?"The exact private file and its container metadata are verified. Inspect it before recording a decision.":"This file has hidden metadata or malformed content and can only be deleted.",actionError:""});created="";
    }catch(error){if(created){try{revokeObjectUrl(created);}catch{/* best effort */}}if(!live(authLease,workLease)||error instanceof Stale)return;
      if(error instanceof Denied)publish({...initialQueueState(),actorId:actor,phase:error.status===403?"forbidden":"signed-out"});
      else publish({storageInspection:null,actionRequestId:"",actionMessage:"",actionError:"The private file could not be verified. Retry the inspection; no decision was recorded."});}
  }
  async function inspectCustody(requestId:string,claimId:string,evidenceId:string,objectFingerprint:string){
    if(disposed||!auth||state.busy||state.actionRequestId||!uuid(requestId)||!uuid(claimId)||!uuid(evidenceId)||!fingerprint(objectFingerprint)||!actor)return;
    const inventory=state.custodyEvidence,item=inventory?.evidence.find(row=>row.evidenceId===evidenceId);
    if(!inventory||inventory.claimId!==claimId||!item||item.objectFingerprint!==objectFingerprint)return;
    const authLease=authRevision,workLease=++workRevision;abort();clearCustodyInspection();publish({custodyInspection:null,actionRequestId:requestId,actionMessage:"",actionError:""});
    let created="";
    try{
      const result=await bounded(()=>auth!.getSession());check(authLease,workLease);if(!result||result.error||!result.data)throw new Error("Session check unavailable");
      const session=readSession(result.data.session);if(!session||session.user.id!==actor)throw new Denied(401);
      const url=`/api/admin/account-deletion-requests/${encodeURIComponent(requestId)}/custody-review/${encodeURIComponent(claimId)}/${encodeURIComponent(evidenceId)}?fingerprint=${encodeURIComponent(objectFingerprint)}`;
      const response=await bounded(signal=>transport(url,{method:"GET",cache:"no-store",credentials:"omit",redirect:"error",headers:{authorization:`Bearer ${session.access_token}`},signal}));check(authLease,workLease);
      if(response.status===401||response.status===403)throw new Denied(response.status);if(!response.ok)throw new Error("Custody proof unavailable");
      const mimeType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase(),length=response.headers.get("content-length");
      if(!storageMimes["instrument-documents"].has(mimeType as never)||!length||!/^\d+$/.test(length)||Number(length)<1||Number(length)>16*1024*1024
        ||!response.headers.get("content-disposition")?.startsWith("inline; filename=\"private-custody-proof."))throw new Error("Invalid custody proof response");
      const blob=await bounded(()=>response.blob());check(authLease,workLease);if(blob.size!==Number(length)||blob.type!==mimeType)throw new Error("Invalid custody proof response");
      const finalAuth=await bounded(()=>auth!.getSession());check(authLease,workLease);const finalSession=readSession(finalAuth.data.session);if(!finalSession||finalSession.user.id!==actor)throw new Denied(401);
      created=createObjectUrl(blob);if(!created||typeof created!=="string")throw new Error("Custody preview unavailable");check(authLease,workLease);
      publish({custodyInspection:{requestId,claimId,evidenceId,objectFingerprint,mimeType,byteSize:blob.size,objectUrl:created},actionRequestId:"",
        actionMessage:"The exact private ownership proof is loaded for this session. Inspect it before recording the byte receipt.",actionError:""});created="";
    }catch(error){if(created){try{revokeObjectUrl(created);}catch{/* best effort */}}if(!live(authLease,workLease)||error instanceof Stale)return;
      if(error instanceof Denied)publish({...initialQueueState(),actorId:actor,phase:error.status===403?"forbidden":"signed-out"});
      else publish({custodyInspection:null,actionRequestId:"",actionMessage:"",actionError:"The ownership proof could not be verified. Retry; no review was recorded."});}
  }  async function execute(requestId: string, action: QueueAction = {action:"prepare"}) {
    if (disposed || !auth || state.busy || state.actionRequestId || !uuid(requestId) || !actor) return;
    if ((action.action==="attest_profile"||action.action==="inspect_profile"||action.action==="redact_profile")&&(!uuid(action.guitarId)||!fingerprint(action.expectedFingerprint)))return;
    if((action.action==="inspect_profile"||action.action==="inspect_retention")&&(!Number.isInteger(action.pageIndex)||action.pageIndex<0))return;
    if ((action.action==="attest_retention"||action.action==="inspect_retention")&&(!["billing","service"].includes(action.domain)||!fingerprint(action.expectedFingerprint)))return;
    if((action.action==="release_custody"||action.action==="inspect_custody")&&(!uuid(action.claimId)||!fingerprint(action.expectedFingerprint)))return;
    if(action.action==="inspect_custody"&&(!Number.isInteger(action.pageIndex)||action.pageIndex<0))return;
    if(action.action==="attest_custody_evidence"&&(!uuid(action.claimId)||!uuid(action.evidenceId)||!fingerprint(action.expectedFingerprint)||!fingerprint(action.expectedObjectFingerprint)||!Number.isInteger(action.pageIndex)||action.pageIndex<0))return;
    if(action.action==="attest_storage"&&(!uuid(action.relocationId)||!fingerprint(action.expectedFingerprint)||!["retain","delete"].includes(action.decision)))return;
    if(action.action==="attest_retention"&&action.decisionCode!==(action.domain==="billing"?"lawful_financial_retention_reviewed":"service_history_privacy_reviewed"))return;
    if(action.action==="redact_profile"){
      const terms=[...new Set(action.terms.map(term=>typeof term==="string"?term.trim():""))].sort((a,b)=>a.localeCompare(b));
      if(terms.length<1||terms.length>32||terms.some(term=>[...term].length<3||[...term].length>200||/[\u0000-\u001f\u007f]/.test(term)))return;action={...action,terms};
    }
    const authLease=authRevision, workLease=++workRevision; abort();
    publish({actionRequestId:requestId,actionMessage:"",actionError:""});
    try {
      const result=await bounded(()=>auth!.getSession()); check(authLease,workLease);
      if(!result||result.error||!result.data) throw new Error("Session check unavailable");
      const session=readSession(result.data.session); if(!session||session.user.id!==actor) throw new Denied(401);
      const operationKey=requestId+":"+JSON.stringify(action),operationId=operationIds.get(operationKey)||crypto.randomUUID();operationIds.set(operationKey,operationId);
      const body=JSON.stringify({operationId,...action});if(new TextEncoder().encode(body).byteLength>65_536)throw new Error("Invalid fulfillment request");
      const response=await bounded(signal=>transport(`/api/admin/account-deletion-requests/${encodeURIComponent(requestId)}/fulfill`,{method:"POST",cache:"no-store",credentials:"omit",redirect:"error",headers:{authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body,signal}));
      check(authLease,workLease); const payload=await bounded(()=>response.json()); check(authLease,workLease);
      if(!response.ok){if(response.status===401||response.status===403)throw new Denied(response.status);throw new Error("Fulfillment unavailable");}
      const next=fulfillmentResult(payload);
      if(action.action==="inspect_profile"&&(!next.reviewSnapshot||next.reviewSnapshot.kind!=="profile"||next.reviewSnapshot.profile.guitarId!==action.guitarId||next.reviewSnapshot.contentFingerprint!==action.expectedFingerprint||next.reviewSnapshot.pageIndex!==action.pageIndex))throw new Error("Review snapshot mismatch");
      if(action.action==="inspect_retention"&&(!next.reviewSnapshot||next.reviewSnapshot.kind!=="retention"||next.reviewSnapshot.retention.domain!==action.domain||next.reviewSnapshot.contentFingerprint!==action.expectedFingerprint||next.reviewSnapshot.pageIndex!==action.pageIndex))throw new Error("Review snapshot mismatch");
      if(action.action==="inspect_custody"&&(!next.custodyEvidence||next.custodyEvidence.claimId!==action.claimId||next.custodyEvidence.profileFingerprint!==action.expectedFingerprint||next.custodyEvidence.pageIndex!==action.pageIndex))throw new Error("Custody inventory mismatch");
      if(action.action==="attest_custody_evidence"&&(!next.custodyEvidence||next.custodyEvidence.claimId!==action.claimId||next.custodyEvidence.profileFingerprint!==action.expectedFingerprint||next.custodyEvidence.pageIndex!==action.pageIndex
        ||!next.custodyEvidence.evidence.some(item=>item.evidenceId===action.evidenceId&&item.objectFingerprint===action.expectedObjectFingerprint&&item.reviewed)))throw new Error("Custody receipt mismatch");
      if(!["inspect_profile","inspect_retention"].includes(action.action)&&next.reviewSnapshot)throw new Error("Unexpected review snapshot");
      if(!["inspect_custody","attest_custody_evidence"].includes(action.action)&&next.custodyEvidence)throw new Error("Unexpected custody inventory");
      const finalAuth=await bounded(()=>auth!.getSession());check(authLease,workLease);const finalSession=readSession(finalAuth.data.session);
      if(!finalSession||finalSession.user.id!==actor)throw new Denied(401);
      operationIds.delete(operationKey);
      const message=action.action==="inspect_profile"||action.action==="inspect_retention"?`Review page ${(next.reviewSnapshot?.pageIndex||0)+1} of ${next.reviewSnapshot?.pageCount||1} is loaded. ${next.reviewSnapshot?.allPagesDelivered?"Every current page has been delivered for confirmation.":"Load every page before confirming."}`:action.action==="inspect_custody"?"The current ownership-proof inventory is loaded. Inspect and attest every file before release.":action.action==="attest_custody_evidence"?"The exact ownership-proof byte receipt was recorded.":action.action==="attest_storage"?`The exact private-file decision was recorded as ${action.decision}. Run the fulfillment check again to continue.`:action.action==="release_custody"?"Reviewed custody was released to the verified claimant. The Profile remains private until its new owner chooses otherwise.":next.fulfillment.state==="completed"?"Account identity removed. Instrument Profiles remain in private custody for review.":action.action==="redact_profile"?"The selected personal-information terms were redacted. Inspect the refreshed fingerprint before confirming.":action.action!=="prepare"?"The exact privacy review was recorded. Run the fulfillment check again to continue.":next.fulfillment.state==="quiescing_storage"?"Account writes are frozen and public content is hidden. Auth remains until the fixed storage safety window is rescanned.":"Fulfillment paused on recorded blockers. No Auth identity was deleted.";
      if(action.action==="attest_storage"||action.action==="prepare")clearStorageInspection();
      if(action.action==="attest_custody_evidence"||action.action==="prepare"||action.action==="release_custody")clearCustodyInspection();
      const preservesProfileReview=action.action==="inspect_custody"||action.action==="attest_custody_evidence";
      publish({requests:state.requests.map(row=>row.requestId===requestId?{...row,fulfillment:next.fulfillment,profileReviews:next.profileReviews,retentionReviews:next.retentionReviews,storageReviews:next.storageReviews}:row),actionRequestId:"",actionMessage:message,actionError:"",reviewRequestId:next.reviewSnapshot?requestId:(preservesProfileReview?state.reviewRequestId:""),reviewSnapshot:next.reviewSnapshot||(preservesProfileReview?state.reviewSnapshot:null),storageInspection:action.action==="attest_storage"||action.action==="prepare"?null:state.storageInspection,custodyEvidence:next.custodyEvidence||((action.action==="prepare"||action.action==="release_custody")?null:state.custodyEvidence),custodyInspection:action.action==="attest_custody_evidence"||action.action==="prepare"||action.action==="release_custody"?null:state.custodyInspection});
      if(next.fulfillment.state==="completed"&&!['inspect_profile','inspect_retention','inspect_custody','attest_custody_evidence'].includes(action.action)){await load(false);if(live(authRevision,workRevision))publish({actionMessage:message});}
    } catch(error) {
      if(!live(authLease,workLease)||error instanceof Stale)return;
      if(error instanceof Denied) publish({...initialQueueState(),actorId:actor,phase:error.status===403?"forbidden":"signed-out"});
      else publish({actionRequestId:"",actionMessage:"",actionError:"Fulfillment could not be confirmed. Retry safely; completion is never assumed."});
    }
  }
  async function start() {
    if (disposed || started) return; started = true;
    try {
      auth = deps.auth();
      const subscription = auth.onAuthStateChange((_event, session) => observe(session));
      unsubscribe = () => subscription.data.subscription.unsubscribe();
      // load handles a synchronous INITIAL_SESSION callback or a later event.
      await load(false);
    } catch {
      if (!disposed) { started = false; unsubscribe?.(); unsubscribe = undefined; auth = undefined; publish({ ...initialQueueState(), phase: "error", error: "The admin session could not be checked. Try again." }); }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: (state: QueueState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start,
    refresh: () => auth ? load(false) : start(),
    loadMore: () => load(true),
    inspectStorage,
    inspectCustody,
    execute,
    dispose() { if (disposed) return; clearStorageInspection();clearCustodyInspection();disposed = true; authRevision++; workRevision++; abort(); operationIds.clear(); unsubscribe?.(); listeners.clear(); }
  };
}
