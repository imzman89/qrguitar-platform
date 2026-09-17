import { buildAppleAppSiteAssociation } from "../../../lib/native-association";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const association = buildAppleAppSiteAssociation(process.env.QRGUITAR_APPLE_TEAM_ID);
  return Response.json(association ?? { error: "not_configured" }, {
    status: association ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
