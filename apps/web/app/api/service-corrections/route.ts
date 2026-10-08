import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
export const dynamic="force-dynamic";
export const revalidate=0;
const uuid=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store, no-cache, must-revalidate"}});}
function failure(error:{code?:string}){
 const status=error.code==="PT409"||error.code==="PD409"||error.code==="23505"?409:error.code==="42501"||error.code==="PD423"?403:error.code==="P0002"?404:error.code==="P0429"?429:error.code?.startsWith("22")?400:503;
 return json({ok:false,uncertain:status===503,message:status===409?"Correction history changed. Reload before continuing.":status===403?"This account cannot perform that correction action.":status===404?"Approved service record unavailable.":status===429?"Correction limit reached. Try again later.":status===400?"Review the correction fields.":"Correction could not be confirmed. Retry only the same request."},status);
}
export async function GET(request:Request){
 const db=createServerSupabaseClient();if(!db)return json({ok:false},503);
 const query=new URL(request.url).searchParams;
 if(query.size!==1)return json({ok:false},400);
 try{
  if(query.has("qrCode")){
   const code=query.get("qrCode")||"";
   if(code.length>80||!/^QRG-[A-Z0-9_-]+$/.test(code))return json({ok:false},400);
   const result=await db.rpc("read_public_service_corrections",{p_qr_code:code}).abortSignal(AbortSignal.timeout(10000));
   if(result.error)return failure(result.error);
   return json({ok:true,corrections:result.data});
  }
  const id=query.get("submissionId");if(!uuid(id))return json({ok:false},400);
  const auth=await getAuthenticatedUser(request);if(!auth.user)return json({ok:false},401);
  const result=await db.rpc("read_service_corrections",{p_actor_id:auth.user.id,p_submission_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(result.error)return failure(result.error);
  return json({ok:true,state:result.data});
 }catch{return failure({});}
}
export async function POST(request:Request){
 const db=createServerSupabaseClient();if(!db)return json({ok:false},503);
 const auth=await getAuthenticatedUser(request);if(!auth.user)return json({ok:false},401);
 const access=await assertAccountCanWrite(db,auth.user);if(!access.ok)return json({ok:false,message:access.message},access.status);
 try{
  const reader=request.body?.getReader();if(!reader)return json({ok:false},400);
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>24576){void reader.cancel();return json({ok:false},413);}chunks.push(part.value);}
  const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(all));}catch{return json({ok:false},400);}
  if(!body||typeof body!=="object"||Array.isArray(body)||!uuid(body.requestId)||!uuid(body.submissionId)||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0)return json({ok:false},400);
  const result=await db.rpc("mutate_service_correction",{p_actor_id:auth.user.id,p_request:body}).abortSignal(AbortSignal.timeout(10000));
  if(result.error)return failure(result.error);
  if(result.data?.committed!==true)return failure({});
  return json({ok:true,receipt:result.data});
 }catch{return failure({});}
}
