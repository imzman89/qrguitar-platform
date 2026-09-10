import { MAX_PROFILE_UPLOAD_BYTES, allowedProfileUpload, cleanProfileFileId, profileUploadBucket, profileUploadPath, validProfileSignedUploadUrl, type ProfileUploadKind } from "./profile-upload-protocol";
export class ProfileUploadError extends Error {
  constructor(message: string, public code: string, public uncertain = false) { super(message); this.name = "ProfileUploadError"; }
}
export function dataUrlToProfileFile(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0 || match[2].length > Math.ceil(MAX_PROFILE_UPLOAD_BYTES/3)*4) throw new ProfileUploadError("The selected file could not be read.","invalid_file");
  try { const binary = atob(match[2]), bytes = new Uint8Array(binary.length); for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i); return new Blob([bytes],{type:match[1].toLowerCase()}); }
  catch { throw new ProfileUploadError("The selected file could not be read.","invalid_file"); }
}
/** Stable across response loss and page restoration without persisting a signed capability. */
export async function profileFileId(file: Blob, namespace = "") {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",await new Blob([namespace,"\0",file]).arrayBuffer()));
  digest[6]=(digest[6]&15)|80; digest[8]=(digest[8]&63)|128;
  const hex=Array.from(digest.slice(0,16),byte=>byte.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
type Options = { file:Blob; uploadId:string; fileId?:string; kind:ProfileUploadKind; expectedOwnerId:string; tokenForOwner:()=>Promise<string> };
type Ports = {fetch:typeof fetch; supabaseUrl:string};
type Handshake = {ok?:boolean;phase?:string;storagePath?:string;kind?:ProfileUploadKind;signedUrl?:string;code?:string;message?:string;uncertain?:boolean};
/** File bytes go directly to Storage; QRguitar only receives bounded JSON metadata. */
export async function uploadProfileFile(options:Options, ports?:Ports):Promise<string> {
  const {file,uploadId,kind,expectedOwnerId,tokenForOwner}=options;
  if (!Number.isSafeInteger(file.size) || file.size<1 || file.size>MAX_PROFILE_UPLOAD_BYTES) throw new ProfileUploadError("Use a nonempty file no larger than 12MB.","file_too_large");
  if (!allowedProfileUpload(kind,file.type)) throw new ProfileUploadError("Use a supported photo or document file.","unsupported_file_type");
  const fileId=options.fileId === undefined ? await profileFileId(file) : cleanProfileFileId(options.fileId);
  const storagePath=profileUploadPath(expectedOwnerId,uploadId,fileId,kind,file.type),bucket=profileUploadBucket(kind);
  if (!storagePath) throw new ProfileUploadError("The upload identity is invalid.","invalid_upload");
  const fetcher=ports?.fetch||fetch, supabaseUrl=ports?.supabaseUrl||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const metadata={uploadId,fileId,kind,expectedOwnerId,mimeType:file.type,size:file.size};
  async function handshake(action:"prepare"|"complete") {
    const token=await tokenForOwner();if(!token)throw new ProfileUploadError("Sign in again before uploading.","auth_required");
    let response:Response;
    try { response=await fetcher("/api/instruments/uploads",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({...metadata,action}),cache:"no-store",signal:AbortSignal.timeout(30000)}); }
    catch { throw new ProfileUploadError("The upload was not confirmed. Retry this same file.","upload_uncertain",true); }
    const result=await response.json().catch(()=>null) as Handshake|null;
    if(!response.ok||result?.ok!==true) throw new ProfileUploadError(result?.message||"The upload was not confirmed. Retry this same file.",result?.code||"upload_uncertain",result?.uncertain===true||!result);
    if(result.storagePath!==storagePath||result.kind!==kind||(result.phase!=="upload"&&result.phase!=="complete")) throw new ProfileUploadError("The upload destination could not be verified.","invalid_upload_response",true);
    return result;
  }
  const prepared=await handshake("prepare");
  if(prepared.phase==="complete")return storagePath;
  if(!validProfileSignedUploadUrl(prepared.signedUrl,supabaseUrl,bucket,storagePath)) throw new ProfileUploadError("The secure upload destination could not be verified.","invalid_signed_upload_url");
  // Recheck the account immediately before sending bytes; no app credentials cross to Storage.
  if(!await tokenForOwner())throw new ProfileUploadError("Sign in again before uploading.","auth_required");
  try { await fetcher(prepared.signedUrl!,{method:"PUT",headers:{"content-type":file.type,"x-upsert":"false"},body:file,credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(120000)}); }
  catch { /* A lost PUT response may have committed. Complete checks the same stable object. */ }
  const completed=await handshake("complete");
  if(completed.phase!=="complete")throw new ProfileUploadError("The uploaded file was not confirmed. Retry this same file.","upload_uncertain",true);
  return storagePath;
}
