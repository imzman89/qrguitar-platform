import { intakeHandlers } from "@/lib/account-deletion/runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const GET = (request: Request) => intakeHandlers.collection(request);
export const POST = (request: Request) => intakeHandlers.collection(request);
