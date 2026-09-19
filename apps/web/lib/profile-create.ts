export class CreateProfileError extends Error {
  constructor(message: string, public readonly code="validation_failed", public readonly status=400) { super(message); }
}
function text(value: unknown, limit: number, label: string) {
  if (value===undefined || value===null) return "";
  if(typeof value!=="string" || value.length>limit) throw new CreateProfileError(`${label} is invalid or too long.`);
  return value.trim();
}
function optional(value: unknown, limit: number, label: string) { return text(value,limit,label)||null; }
function list(value: unknown, limit: number, label: string): unknown[] {
  if(value===undefined) return [];
  if(!Array.isArray(value) || value.length>limit) throw new CreateProfileError(`${label} must contain no more than ${limit} items.`);
  return value;
}
function record(value: unknown): Record<string,unknown> {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new CreateProfileError("Invalid profile details.");
  return value as Record<string,unknown>;
}
function date(value: unknown) {
  const result=text(value,10,"Date");
  if(result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString().slice(0,10)!==result)) {
    throw new CreateProfileError("Choose a valid calendar date.");
  }
  return result||null;
}
// Normalize once so identical retries have an identical canonical JSONB fingerprint.
export function buildCreateProfilePayload(body: Record<string,unknown>, canonicalBrand: string, _ownerName: string, linkLabel: (value:string)=>string) {
  const brand=text(canonicalBrand,200,"Brand"), model=text(body.model,200,"Model");
  const serial=optional(body.serial,200,"Serial Number");
  if(!brand||!model||!text(body.instrumentType,200,"Instrument type")||(!serial&&body.serialNotUsed!==true)) throw new CreateProfileError("Brand, model, instrument type and Serial Number are required unless no serial is used.");
  if(serial && serial.toUpperCase().replace(/[^A-Z0-9]/g,"").length<4) throw new CreateProfileError("Serial Number must contain at least four letters or numbers.");
  const mediaPaths=[...new Set(list(body.photos,20,"Photos").map((value)=>text(value,2000,"Photo path")))];
  if(!mediaPaths.length || mediaPaths.some((path)=>!path)) throw new CreateProfileError("Add at least one uploaded photo.");
  const hero=text(body.heroImagePath||body.heroImageDataUrl||mediaPaths[0],2000,"Main photo");
  if(!mediaPaths.includes(hero)) throw new CreateProfileError("Choose a main photo from the uploaded photos.","invalid_main_photo");
  const documents=list(body.documents,10,"Documents").map((value,index)=>{
    const d=record(value);
    if(text(d.relatedTimelineEventId,80,"Related event") || text(d.relatedServiceEventId,80,"Related event")) throw new CreateProfileError("Link documents to timeline events after creating this Profile.");
    return {
      name:text(d.name,200,"Document name")||`Document ${index+1}`,storage_path:text(d.storagePath,2000,"Document path"),
      is_public:d.visibility==="public",document_type:text(d.documentType,80,"Document type")||"Other",
      public_description:optional(d.publicDescription,1000,"Public document description"),private_notes:optional(d.privateNotes,2000,"Private document notes"),
      issuer_source:optional(d.issuerSource,200,"Issuer"),document_date:date(d.documentDate),description:optional(d.description,1000,"Document description"),
      related_timeline_event_id:null,related_service_event_id:null
    };
  });
  if(documents.some((d)=>!d.storage_path)||new Set(documents.map((d)=>d.storage_path)).size!==documents.length) throw new CreateProfileError("Each document must have its own completed upload.");
  const fields=list(body.customFields,89,"Custom details").map((value)=>{
    const f=record(value);return {label:text(f.label,200,"Detail label"),value:text(f.value,10000,"Detail value")};
  }).filter((field)=>field.label||field.value);
  if(fields.some((field)=>!field.label||!field.value)) throw new CreateProfileError("Add a label and value for each custom detail.");
  const links=list(body.customLinks,6,"Supporting links").map((value)=>{
    const link=record(value);return {label:text(link.label,200,"Link label"),url:text(link.url,2000,"Link URL")};
  }).filter((link)=>link.label||link.url);
  for(const link of links){
    try{const url=new URL(link.url);if(!link.label||url.protocol!=="https:"||url.username||url.password)throw new Error();}
    catch{throw new CreateProfileError("Add a label and secure https:// URL for every supporting link.");}
  }
  const specs=[
    {label:"Condition",value:body.condition==="new"?"new":"used",sort_order:1},
    {label:"Type",value:text(body.instrumentType,200,"Instrument type"),sort_order:2},
    ...(text(body.finish,200,"Finish")?[{label:"Finish",value:text(body.finish,200,"Finish"),sort_order:3}]:[]),
    {label:"Availability",value:body.saleStatus==="for_sale"?"for_sale":"not_for_sale",sort_order:4},
    {label:"Originality",value:body.originalityStatus==="all_original"?"all_original":body.originalityStatus==="modified"?"modified":"unknown",sort_order:5},
    ...fields.map((field,index)=>({...field,sort_order:index+6})),
    ...links.map((link,index)=>({label:linkLabel(link.label).slice(0,200),value:link.url,sort_order:fields.length+index+6}))
  ];
  let service: Record<string,unknown>|null=null;
  if(body.serviceEntry!==undefined && body.serviceEntry!==null){
    const entry=record(body.serviceEntry);
    if(text(entry.title,200,"Service title")||text(entry.publicDescription,2000,"Service description")||text(entry.privateNotes,2000,"Private service notes")){
      service={event_date:date(entry.serviceDate),event_type:text(entry.eventType,80,"Event type")||"Service",
        title:text(entry.title,200,"Service title")||"Service history",description:text(entry.publicDescription,2000,"Service description"),
        private_notes:optional(entry.privateNotes,2000,"Private service notes"),shop_name:optional(entry.shopName,200,"Shop name"),
        location:optional(entry.location||body.location,200,"Service location"),is_public:entry.isPublic===true};
    }
  }
  return {
    guitar:{name:text(body.name,300,"Name")||`${brand} ${model}`,brand,model,year:optional(body.year,20,"Year"),
      serial_number:serial,builder:optional(body.builder,200,"Builder"),location:optional(body.location,200,"Location"),
      visibility:body.visibility==="private"?"private":body.visibility==="unlisted"?"unlisted":"public",
      summary:text(body.summary,10000,"Summary"),hero_image_path:hero},
    media:mediaPaths.map((storage_path,index)=>({storage_path,alt:`${brand} ${model} photo ${index+1}`.trim(),sort_order:index})),
    documents,specs,service,owner_name:text(body.ownerName,300,"Owner name"),
    show_serial_public:Boolean(serial)&&body.showSerialPublic!==false
  };
}
export function createProfileFailure(error: {code?:string;message?:string}|null): {status:number;code:string;message:string;retryable:boolean;resetUploads?:boolean} {
  if(error?.code==="PGRST202"||error?.code==="42883") return {status:503,code:"create_unavailable",message:"Profile creation is temporarily unavailable. Your form and uploads have been preserved.",retryable:true};
  if(error?.code==="QG001") return {status:402,code:"profile_limit_reached",message:"Your 25 free Profiles are in use and no additional Profile credits are available. Your existing Profiles stay available. Check Profile credits in your account, or contact QRguitar for help.",retryable:false};
  if(error?.code==="QG008") return {status:409,code:"billing_review_required",message:"Your paid Profile credits need a billing review. Open Profile credits in your account for the current status. Your form and uploads are preserved.",retryable:false};
  if(error?.code==="QG002"||error?.code==="23505") return {status:409,code:"duplicate_serial",message:"A QRguitar Profile already uses this identity. Open the existing Profile or request ownership.",retryable:false};
  if(error?.code==="QG003") return {status:409,code:"legacy_request_needs_review",message:"This older create request needs QRguitar support to review it. Existing Profiles and files have been preserved.",retryable:false};
  if(error?.code==="QG004") return {status:409,code:"create_request_conflict",message:"This request or upload session was already used with different details. Reload the result before starting a new Profile.",retryable:false};
  if(error?.code==="QG007") return {status:409,code:"upload_session_changed",message:"A selected upload was removed or is no longer available. Retry to upload the selected files again.",retryable:true,resetUploads:true};
  if(error?.code==="QG005") return {status:400,code:"invalid_upload",message:"An uploaded file is missing or incomplete. Upload it again before creating the Profile.",retryable:true};
  if(error?.code==="42501") return {status:403,code:"create_forbidden",message:"This account or upload session cannot create this Profile.",retryable:false};
  if(["22023","22007","22008","22P02"].includes(error?.code||"")) return {status:400,code:"validation_failed",message:error?.message||"Check the profile details.",retryable:false};
  return {status:502,code:"create_unconfirmed",message:"The create result could not be confirmed. Retry this same request to recover its result safely.",retryable:true};
}


