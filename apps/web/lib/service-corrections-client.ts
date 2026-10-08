export type CorrectionRow={id:string;details:string;submittedAt:string;outcome:"pending"|"accepted"|"rejected";isPublic:boolean;decidedAt:string|null;canAccept:boolean;canReject:boolean};
export type CorrectionRecord={submissionId:string;revision:number;eventUpdatedAt:string;canPropose:boolean;canReview:boolean;original:{id:string;title:string;details:string;serviceDate:string|null;partsInstalled:string|null;setupMeasurements:string|null};corrections:CorrectionRow[]};
type Session={access_token:string;user:{id:string}}|null;
type Auth={getSession():Promise<{data:{session:Session};error?:unknown}>;onAuthStateChange(cb:(event:string,session:Session)=>void):{data:{subscription:{unsubscribe():void}}}};
export type CorrectionState={actorId:string;sessionRevision:number;phase:"loading"|"ready"|"signed-out"|"error";record:CorrectionRecord|null;busy:boolean;uncertain:boolean;message:string};
export function createServiceCorrectionClient(submissionId:string,deps:{auth:Auth;fetch?:typeof fetch;requestId?:()=>string}){
 const transport=deps.fetch||fetch,makeId=deps.requestId||(()=>crypto.randomUUID());
 let state:CorrectionState={actorId:"",sessionRevision:0,phase:"loading",record:null,busy:false,uncertain:false,message:""};
 let generation=0,disposed=false,lock=false,subscription:{unsubscribe():void}|undefined;
 let pending:Record<string,unknown>|null=null;
 const listeners=new Set<(s:CorrectionState)=>void>(),controllers=new Set<AbortController>();
 const publish=(patch:Partial<CorrectionState>)=>{if(!disposed){state={...state,...patch};listeners.forEach(fn=>fn(state));}};
 const current=(g:number)=>!disposed&&generation===g;
 async function bounded<T>(fn:(signal:AbortSignal)=>Promise<T>){
  const c=new AbortController();controllers.add(c);let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([fn(c.signal),new Promise<never>((_,reject)=>{c.signal.addEventListener("abort",()=>reject(new Error("Correction request interrupted.")),{once:true});timer=setTimeout(()=>c.abort(),15000);})]);}
  finally{if(timer)clearTimeout(timer);controllers.delete(c);}
 }
 async function session(g:number){
  const result=await bounded(()=>deps.auth.getSession());
  if(!current(g))throw new Error("Stale correction session.");
  const s=result.data.session;
  if(result.error||!s?.access_token||s.user.id!==state.actorId)throw new Error("Sign-in session changed. Reload before continuing.");
  return s;
 }
 async function request(g:number,body?:Record<string,unknown>){
  const s=await session(g);if(!current(g))throw new Error("Stale correction session.");
  return bounded(async signal=>{const response=await transport(body?"/api/service-corrections":
    "/api/service-corrections?submissionId="+encodeURIComponent(submissionId),{
    method:body?"POST":"GET",cache:"no-store",signal,headers:{authorization:"Bearer "+s.access_token,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const payload=await response.json().catch(()=>null);return{response,payload};});
 }
 async function load(g=generation){
  if(lock||!state.actorId)return;
  lock=true;publish({busy:true,phase:"loading",record:null,message:""});
  try{const {response,payload}=await request(g);if(!current(g))return;
   if(!response.ok||payload?.ok!==true||payload.state?.submissionId!==submissionId||!Number.isSafeInteger(payload.state.revision)||!Array.isArray(payload.state.corrections))throw new Error("Correction history unavailable. Reload before continuing.");
   publish({record:payload.state,phase:"ready",message:""});
  }catch(error){if(current(g))publish({record:null,phase:"error",message:error instanceof Error?error.message:"Correction history unavailable."});}
  finally{if(current(g)){lock=false;publish({busy:false});}}
 }
 function change(s:Session){generation++;controllers.forEach(c=>c.abort());controllers.clear();pending=null;lock=false;
  publish({sessionRevision:generation,actorId:s?.access_token?s.user.id:"",record:null,phase:s?.access_token?"loading":"signed-out",busy:false,uncertain:false,message:""});
  if(state.actorId)void load(generation);
 }
 async function start(){
  subscription=deps.auth.onAuthStateChange((event,s)=>{if(event==="INITIAL_SESSION")return;
   if(event==="TOKEN_REFRESHED"&&s?.user.id===state.actorId)return;change(s);}).data.subscription;
  const g=generation;
  try{const result=await bounded(()=>deps.auth.getSession());if(current(g)){if(result.error)throw new Error("Could not check sign-in.");change(result.data.session);}}
  catch{if(current(g))publish({phase:"error",record:null,message:"Could not check sign-in."});}
 }
 async function send(){
  if(lock||!pending||!state.actorId)return;
  const g=generation,body=pending;lock=true;publish({busy:true,message:""});
  let confirmed=false;
  try{const {response,payload}=await request(g,body);if(!current(g))return;
   if(!response.ok||payload?.ok!==true||payload.receipt?.committed!==true){
    const uncertain=!payload||payload.uncertain===true||response.status>=500;
    if(!uncertain)pending=null;
    publish({uncertain,phase:uncertain?state.phase:"error",record:uncertain?state.record:null,message:uncertain?"Correction not confirmed. Retry only this same request.":payload?.message||"Correction rejected. Reload before continuing."});return;
   }
   pending=null;confirmed=true;publish({uncertain:false,record:null});
  }catch{if(current(g))publish({uncertain:true,message:"Correction not confirmed. Retry only this same request."});}
  finally{if(current(g)){lock=false;publish({busy:false});}}
  if(confirmed&&current(g))await load(g);
 }
 async function act(action:"propose"|"accept"|"reject",input:{details?:string;correctionId?:string;sharePublicly?:boolean},lease:{actorId:string;sessionRevision:number}){
  if(lease.actorId!==state.actorId||lease.sessionRevision!==state.sessionRevision||lock||pending||state.phase!=="ready"||!state.record)return;
  const r=state.record;
  if(action==="propose"&&!r.canPropose)return;
  const c=r.corrections.find(row=>row.id===input.correctionId);
  if(action!=="propose"&&(!r.canReview||!c||(action==="accept"?!c.canAccept:!c.canReject)))return;
  pending={action,requestId:makeId(),submissionId,expectedRevision:r.revision,
   ...(action==="propose"?{details:input.details||"",expectedEventUpdatedAt:r.eventUpdatedAt}:{correctionId:input.correctionId,sharePublicly:action==="accept"&&input.sharePublicly===true})};
  await send();
 }
 return{getState:()=>state,subscribe(fn:(s:CorrectionState)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},start,
  reload:()=>pending?Promise.resolve():load(),act,retry:(lease:{actorId:string;sessionRevision:number})=>lease.actorId===state.actorId&&lease.sessionRevision===state.sessionRevision?send():Promise.resolve(),
  dispose(){disposed=true;generation++;controllers.forEach(c=>c.abort());controllers.clear();subscription?.unsubscribe();listeners.clear();pending=null;lock=false;state={...state,record:null};}};
}
