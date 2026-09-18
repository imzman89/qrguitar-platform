import { fulfillmentHandlers } from "@/lib/account-deletion/fulfillment-runtime";

export const dynamic="force-dynamic";
export const revalidate=0;
export const fetchCache="force-no-store";
type Context={params:Promise<{requestId:string}>};
export async function GET(request:Request,{params}:Context){return fulfillmentHandlers.item(request,(await params).requestId);}
export async function POST(request:Request,{params}:Context){return fulfillmentHandlers.item(request,(await params).requestId);}
