import { fulfillmentHandlers } from "@/lib/account-deletion/fulfillment-runtime";

export const dynamic="force-dynamic";
export const revalidate=0;
export const fetchCache="force-no-store";
type Context={params:Promise<{requestId:string;claimId:string;evidenceId:string}>};
export async function GET(request:Request,{params}:Context){const value=await params;return fulfillmentHandlers.custodyReview(request,value.requestId,value.claimId,value.evidenceId);}