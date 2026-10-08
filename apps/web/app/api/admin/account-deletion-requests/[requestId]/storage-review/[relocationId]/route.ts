import { fulfillmentHandlers } from "@/lib/account-deletion/fulfillment-runtime";

export const dynamic="force-dynamic";
export const revalidate=0;
export const fetchCache="force-no-store";
type Context={params:Promise<{requestId:string;relocationId:string}>};
export async function GET(request:Request,{params}:Context){const value=await params;return fulfillmentHandlers.storageReview(request,value.requestId,value.relocationId);}
