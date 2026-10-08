import { buildAndroidAssetLinks } from "../../../lib/native-association";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const association = buildAndroidAssetLinks(process.env.QRGUITAR_ANDROID_SHA256_CERT_FINGERPRINTS);
  return Response.json(association ?? { error: "not_configured" }, {
    status: association ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
