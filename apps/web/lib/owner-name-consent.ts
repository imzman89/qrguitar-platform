import type { IntakeAuth, IntakeSession } from "./account-deletion/deletion-intake-client";

export type OwnerNameItem = { eventId: string; eventDate: string | null; reference: string; enabled: boolean; publicName: string | null; version: string };
export type OwnerNameRow = { confirmed: OwnerNameItem; draftEnabled: boolean; draftName: string; editRevision: number; operation: number; certainty: "confirmed" | "unknown"; pending: "save" | "remove" | null; error: string };
export type OwnerNameState = { actorId: string; phase: "loading" | "ready" | "error" | "signed-out" | "account-changed"; rows: OwnerNameRow[]; nextCursor: string | null; refreshing: boolean; error: string };
export const ownerNameUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const ownerNameVersion = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v) && (v.length < 19 || v <= "9223372036854775807");
export function cleanOwnerPublicName(v: unknown) {
  if (typeof v !== "string" || /[\u0000-\u001f\u007f]/.test(v)) return "";
  const name = v.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 80 ? name : "";
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function readOwnerNameItem(v: unknown): OwnerNameItem {
  const r = object(v);
  if (!ownerNameUuid(r.eventId) || !ownerNameVersion(r.version) || typeof r.enabled !== "boolean"
      || (r.eventDate !== null && (typeof r.eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.eventDate) || !Number.isFinite(Date.parse(r.eventDate))))
      || r.reference !== "Ownership event " + r.eventId.slice(-8).toUpperCase()
      || (r.enabled ? !cleanOwnerPublicName(r.publicName) || r.publicName !== cleanOwnerPublicName(r.publicName) : r.publicName !== null)) {
    throw new Error("The saved name setting could not be verified. Reload before sharing a name.");
  }
  return { eventId: r.eventId, eventDate: r.eventDate as string | null, reference: r.reference as string, enabled: r.enabled, publicName: r.publicName as string | null, version: r.version };
}
export function initialOwnerNameState(): OwnerNameState { return { actorId: "", phase: "loading", rows: [], nextCursor: null, refreshing: false, error: "" }; }
class StaleOwnerName extends Error {}
export function createOwnerNameConsentClient(deps: { actorId: string; auth: () => IntakeAuth; fetch?: typeof fetch; timeoutMs?: number }) {
  const expected = deps.actorId.toLowerCase(), transport = deps.fetch ?? fetch;
  let state = initialOwnerNameState(), auth: IntakeAuth | undefined, unsubscribe: (() => void) | undefined;
  let disposed = false, epoch = 0, readRevision = 0, operationSequence = 0, observed: string | undefined = undefined, started = false;
  const draftCache = new Map<string, OwnerNameRow>();
  const listeners = new Set<(s: OwnerNameState) => void>(), requests = new Map<AbortController, "read" | "write">();
  function publish(p: Partial<OwnerNameState>) { if (!disposed) {
    if(p.rows) for(const r of p.rows) {
      if(r.certainty==="unknown" || r.draftEnabled!==r.confirmed.enabled || r.draftName!==(r.confirmed.publicName??"")) draftCache.set(r.confirmed.eventId,r);
      else draftCache.delete(r.confirmed.eventId);
    }
    state = { ...state, ...p }; listeners.forEach(f => f(state));
  } }
  function live(lease: number) { return !disposed && epoch === lease && state.actorId === expected && ownerNameUuid(expected); }
  function check(lease: number) { if (!live(lease)) throw new StaleOwnerName(); }
  function abort(kind?: "read") { for (const [c,k] of requests) if (!kind || k === kind) c.abort(); }
  async function bounded<T>(kind: "read" | "write", run: (signal: AbortSignal) => Promise<T>) {
    const c = new AbortController(); requests.set(c,kind); let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_,reject) => { c.signal.addEventListener("abort", () => reject(new Error("The saved setting is not confirmed. Reload before sharing a name.")), { once: true }); });
    try {
      timer = setTimeout(() => c.abort(), deps.timeoutMs ?? 20_000);
      return await Promise.race([Promise.resolve().then(() => run(c.signal)), interrupted]);
    } finally { if(timer) clearTimeout(timer); requests.delete(c); }
  }
  function observe(s: IntakeSession) {
    const actor = s?.access_token && ownerNameUuid(s.user.id.toLowerCase()) ? s.user.id.toLowerCase() : "";
    if (disposed || observed === actor) return;
    observed = actor; epoch++; readRevision++; abort(); draftCache.clear();
    publish({ ...initialOwnerNameState(), actorId: actor === expected ? actor : "", phase: actor ? actor === expected ? "loading" : "account-changed" : "signed-out" });
    if (actor === expected) void load(false);
  }
  async function session(lease: number) {
    check(lease); if (!auth) throw new Error("Sign in is unavailable. Refresh to try again.");
    const r = await bounded("read", () => auth!.getSession()); check(lease);
    if (r.error) throw new Error("Could not verify your sign in. Refresh to try again.");
    if (!r.data.session?.access_token || r.data.session.user.id.toLowerCase() !== expected) { observe(r.data.session); throw new StaleOwnerName(); }
    return r.data.session;
  }
  async function request(lease: number, body?: { eventId: string; enabled: boolean; publicName: string | null; expectedVersion: string }, cursor?: string) {
    const s = await session(lease), path = "/api/account/owner-name-consents" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : "");
    const result = await bounded(body ? "write" : "read", async signal => {
      const response = await transport(path,{method:body ? "PATCH" : "GET",signal,cache:"no-store",credentials:"omit",redirect:"error",
        headers:{authorization:"Bearer " + s.access_token,...(body ? {"content-type":"application/json"} : {})},
        ...(body ? {body:JSON.stringify({expectedActorId:expected,...body})} : {})});
      return { response,payload:object(await response.json()) };
    });
    check(lease); await session(lease);
    if (!result.response.ok || result.payload.ok !== true || result.payload.actorId !== expected) {
      throw new Error(typeof result.payload.message === "string" && result.payload.message.length < 500 ? result.payload.message : "The saved setting is not confirmed. Reload before sharing a name.");
    }
    return result.payload;
  }
  async function load(more: boolean) {
    if (disposed || state.actorId !== expected || !ownerNameUuid(expected) || state.refreshing || state.rows.some(r=>r.pending)) return;
    const cursor = more ? state.nextCursor : null; if(more && !cursor) return;
    for(const r of state.rows) if(r.certainty==="unknown" || r.draftEnabled!==r.confirmed.enabled || r.draftName!==(r.confirmed.publicName??"")) draftCache.set(r.confirmed.eventId,r);
    const lease = epoch, revision = ++readRevision;
    publish({refreshing:true,error:""});
    try {
      const p = await request(lease,undefined,cursor ?? undefined); check(lease);
      if(revision !== readRevision) return;
      if(!Array.isArray(p.items) || p.items.length > 100 || (p.nextCursor !== null && !ownerNameUuid(p.nextCursor))) throw new Error("The saved settings could not be verified.");
      const items = p.items.map(readOwnerNameItem), ids = items.map(i=>i.eventId);
      if(new Set(ids).size !== ids.length || ids.some((id,i)=>i>0 && id<=ids[i-1]) || (cursor && ids.some(id=>id<=cursor))
        || (p.nextCursor !== null && (items.length===0 || p.nextCursor !== ids[ids.length-1]))) throw new Error("The saved settings could not be verified.");
      const rows = items.map(item => {
        const old = state.rows.find(r=>r.confirmed.eventId===item.eventId) ?? draftCache.get(item.eventId), dirty=old && (old.draftEnabled!==old.confirmed.enabled || old.draftName!==(old.confirmed.publicName ?? ""));
        return {confirmed:item,draftEnabled:dirty ? old.draftEnabled : item.enabled,draftName:dirty ? old.draftName : item.publicName ?? "",editRevision:old?.editRevision ?? 0,
          operation:old?.operation ?? 0,certainty:"confirmed" as const,pending:null,error:""};
      });
      publish({rows:more ? [...state.rows,...rows] : rows,nextCursor:p.nextCursor as string | null,phase:"ready",refreshing:false,error:""});
    } catch(e) { if(live(lease) && revision===readRevision) publish({phase:"error",refreshing:false,error:e instanceof Error ? e.message : "Could not load saved settings."}); }
  }
  function row(id: string) { return state.rows.find(r=>r.confirmed.eventId===id); }
  function update(id: string,patch: Partial<OwnerNameRow>) { publish({rows:state.rows.map(r=>r.confirmed.eventId===id ? {...r,...patch} : r)}); }
  async function mutate(id: string,remove: boolean) {
    const r=row(id); if(disposed || state.actorId!==expected || !r || (remove ? r.pending==="remove" : r.pending || r.certainty!=="confirmed")) return;
    const name=cleanOwnerPublicName(r.draftName);
    if(!remove && (!r.draftEnabled || !name)) return;
    if(!remove && r.confirmed.enabled && name===r.confirmed.publicName) { draftCache.delete(id);update(id,{draftName:name,editRevision:r.editRevision+1,error:""});return; }
    const lease=epoch,operation=++operationSequence,editRevision=r.editRevision; readRevision++; abort("read");
    update(id,{operation,pending:remove ? "remove" : "save",certainty:"unknown",error:"",...(remove ? {draftEnabled:false,draftName:"",editRevision:editRevision+1} : {})});
    publish({refreshing:false});
    try {
      const p=await request(lease,{eventId:id,enabled:!remove,publicName:remove ? null : name,expectedVersion:r.confirmed.version});check(lease);
      const current=row(id);if(!current || current.operation!==operation) return;
      const saved=readOwnerNameItem(p.item);
      if(saved.eventId!==id || saved.enabled===remove || saved.publicName!==(remove ? null : name) || BigInt(saved.version)<=BigInt(r.confirmed.version)) throw new Error("The saved setting could not be verified.");
      draftCache.delete(id);
      const unchanged=current.editRevision===(remove ? editRevision+1 : editRevision);
      update(id,{confirmed:saved,certainty:"confirmed",pending:null,error:"",...(unchanged ? {draftEnabled:saved.enabled,draftName:saved.publicName ?? ""} : {})});
    } catch(e) { if(live(lease) && row(id)?.operation===operation) update(id,{pending:null,certainty:"unknown",error:e instanceof Error ? e.message : "The saved setting is not confirmed. Reload before sharing a name."}); }
  }
  async function start() {
    if(disposed || started) return;started=true;
    if(!ownerNameUuid(expected)) {publish({phase:"signed-out"});return;}
    const lease=epoch;
    try {
      auth=deps.auth();const sub=auth.onAuthStateChange((_event,s)=>observe(s));unsubscribe=()=>sub.data.subscription.unsubscribe();
      const r=await bounded("read",()=>auth!.getSession());if(disposed || epoch!==lease) return;
      if(r.error) throw new Error("Could not verify your sign in.");
      const actor=r.data.session?.access_token ? r.data.session.user.id.toLowerCase() : "";
      if(observed===actor && actor===expected) {publish({actorId:expected});await load(false);}else observe(r.data.session);
    } catch(e) {if(!disposed && epoch===lease)publish({phase:"error",error:e instanceof Error ? e.message : "Could not verify your sign in."});}
  }
  return {getState:()=>state,subscribe(f:(s:OwnerNameState)=>void){listeners.add(f);return()=>{listeners.delete(f);};},start,
    reload:async()=>{if(!state.actorId && state.phase==="error"){started=false;unsubscribe?.();await start();}else await load(false);},loadMore:()=>load(true),
    edit(id:string,draft:{enabled?:boolean;name?:string}){const r=row(id);if(disposed || state.actorId!==expected || !r)return;update(id,{draftEnabled:draft.enabled ?? r.draftEnabled,draftName:draft.name ?? r.draftName,editRevision:r.editRevision+1,error:""});},
    save:(id:string)=>mutate(id,false),remove:(id:string)=>mutate(id,true),
    dispose(){if(disposed)return;disposed=true;epoch++;readRevision++;abort();unsubscribe?.();listeners.clear();draftCache.clear();state=initialOwnerNameState();}
  };
}

