import { intakeHandlers } from "@/lib/account-deletion/runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  return intakeHandlers.item(request, requestId);
}
