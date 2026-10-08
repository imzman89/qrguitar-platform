import { adminJson, requireAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  return adminJson({ ok: true });
}
