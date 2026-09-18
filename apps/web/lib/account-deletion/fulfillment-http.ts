import { FulfillmentError, publicFulfillmentError, type FulfillmentService } from "./fulfillment-service";

const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", Vary: "Authorization" };
const maxBodyBytes = 65_536;
const json = (body: unknown, status = 200, extra: Record<string,string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
function origin(request: Request) {
  const site=request.headers.get("sec-fetch-site"), source=request.headers.get("origin");
  if ((site && !["same-origin","none"].includes(site)) || (source && source!==new URL(request.url).origin)) throw new FulfillmentError(403,"origin_not_allowed","Open deletion controls from QRguitar to continue.");
}
async function input(request: Request, timeoutMs: number) {
  if (request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json") throw new FulfillmentError(415,"invalid_content_type","Send an application/json request.");
  const encoding=request.headers.get("content-encoding");
  if(encoding&&encoding.toLowerCase()!=="identity") throw new FulfillmentError(415,"invalid_encoding","Unsupported request encoding.");
  const length=request.headers.get("content-length"); if (length!==null && (!/^\d+$/.test(length)||Number(length)>maxBodyBytes)) throw new FulfillmentError(413,"body_too_large","The request is too large.");
  const reader=request.body?.getReader(); if(!reader) throw new FulfillmentError(400,"invalid_body","A request body is required.");
  let timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined,cancel=false,text="";
  const stopped=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new FulfillmentError(408,"body_timeout","The request body did not arrive in time.")),timeoutMs);onAbort=()=>reject(new FulfillmentError(400,"invalid_body","The request body was interrupted."));request.signal.addEventListener("abort",onAbort,{once:true});});
  try {
    if(request.signal.aborted) throw new FulfillmentError(400,"invalid_body","The request body was interrupted.");
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await Promise.race([reader.read(),stopped]);if(part.done)break;size+=part.value.byteLength;if(size>maxBodyBytes)throw new FulfillmentError(413,"body_too_large","The request is too large.");chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    const keys=[...text.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)].map(match=>JSON.parse(match[1]) as string);
    if (new Set(keys).size!==keys.length) throw new Error();
    return JSON.parse(text) as unknown;
  } catch(failure) {
    cancel=true;
    if(failure instanceof FulfillmentError) throw failure;
    throw new FulfillmentError(400,"invalid_body",text?"The request must contain valid, unambiguous JSON.":"The request body could not be read.");
  } finally {
    if(timer)clearTimeout(timer);if(onAbort)request.signal.removeEventListener("abort",onAbort);if(cancel)void reader.cancel().catch(()=>undefined);
    try{reader.releaseLock();}catch{/* A pending cancellation owns the lock until its read settles. */}
  }
}
export function createFulfillmentHandlers(deps: { service(): FulfillmentService | null; bodyTimeoutMs?:number }) {
  const bodyTimeout=Math.max(1,Math.min(deps.bodyTimeoutMs??8000,15_000));
  const service=()=>{const value=deps.service(); if(!value) throw new FulfillmentError(503,"fulfillment_unavailable","Deletion controls are temporarily unavailable.",true); return value;};
  const run=async(work:()=>Promise<unknown>)=>{try{return json(await work());}catch(error){const safe=publicFulfillmentError(error);return json(safe.body,safe.status);}};
  return { item(request:Request,requestId:string) {
    if(!["GET","POST"].includes(request.method)) return Promise.resolve(json({ok:false,code:"method_not_allowed",message:"This action is not available.",retryable:false},405,{Allow:"GET, POST"}));
    return run(async()=>{origin(request); const url=new URL(request.url); if([...url.searchParams].length) throw new FulfillmentError(400,"invalid_query","This endpoint does not accept query fields.");
      return request.method==="GET"?service().read(request,requestId):service().execute(request,requestId,await input(request,bodyTimeout));});
  }, async storageReview(request:Request,requestId:string,relocationId:string) {
    if(request.method!=="GET")return json({ok:false,code:"method_not_allowed",message:"This action is not available.",retryable:false},405,{Allow:"GET"});
    try {
      origin(request);const url=new URL(request.url),fingerprint=url.searchParams.get("fingerprint");
      if([...url.searchParams].length!==1||!fingerprint)throw new FulfillmentError(400,"invalid_query","An exact private-file fingerprint is required.");
      const inspected=await service().inspectStorage(request,requestId,relocationId,fingerprint);
      const extension=inspected.mimeType==="application/pdf"?"pdf":inspected.mimeType==="image/png"?"png":inspected.mimeType==="image/webp"?"webp":"jpg";
      const body=inspected.bytes.buffer.slice(inspected.bytes.byteOffset,inspected.bytes.byteOffset+inspected.bytes.byteLength) as ArrayBuffer;
      return new Response(body,{status:200,headers:{...headers,"Content-Type":inspected.mimeType,"Content-Length":String(inspected.byteSize),
        "Content-Disposition":`inline; filename="private-storage-review.${extension}"`,"Referrer-Policy":"no-referrer",
        "Content-Security-Policy":"sandbox; default-src 'none'; img-src 'self' blob:; style-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'self'",
        "X-QR-Content-Structure":inspected.structureValid?"valid":"malformed",
        "X-QR-Hidden-Metadata":inspected.metadataFindings.join(","),
        "X-Robots-Tag":"noindex, nofollow, noarchive","X-Frame-Options":"SAMEORIGIN"}});
    }catch(error){const safe=publicFulfillmentError(error);return json(safe.body,safe.status);}
  }, async custodyReview(request:Request,requestId:string,claimId:string,evidenceId:string) {
    if(request.method!=="GET")return json({ok:false,code:"method_not_allowed",message:"This action is not available.",retryable:false},405,{Allow:"GET"});
    try{
      origin(request);const url=new URL(request.url),fingerprint=url.searchParams.get("fingerprint");
      if([...url.searchParams].length!==1||!fingerprint)throw new FulfillmentError(400,"invalid_query","An exact custody-proof fingerprint is required.");
      const inspected=await service().inspectCustody(request,requestId,claimId,evidenceId,fingerprint);
      const extension=inspected.mimeType==="application/pdf"?"pdf":inspected.mimeType==="image/png"?"png":inspected.mimeType==="image/webp"?"webp":"jpg";
      const body=inspected.bytes.buffer.slice(inspected.bytes.byteOffset,inspected.bytes.byteOffset+inspected.bytes.byteLength) as ArrayBuffer;
      return new Response(body,{status:200,headers:{...headers,"Content-Type":inspected.mimeType,"Content-Length":String(inspected.byteSize),
        "Content-Disposition":`inline; filename="private-custody-proof.${extension}"`,"Content-Security-Policy":"sandbox; default-src 'none'; img-src 'self' blob:; style-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'self'",
        "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","X-Frame-Options":"SAMEORIGIN"}});
    }catch(error){const safe=publicFulfillmentError(error);return json(safe.body,safe.status);}
  }};
}
