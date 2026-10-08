import { resolveBuildIdentity } from "../../../lib/build-identity.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host") || requestUrl.host;
  const requestProtocol = forwardedProtocol || requestUrl.protocol.replace(":", "");
  const originUrl = new URL(`${requestProtocol}://${requestHost}`);
  const isCanonicalLocal = originUrl.hostname === "127.0.0.1" && originUrl.port === "3003";
  const isLocal = originUrl.hostname === "127.0.0.1" || originUrl.hostname === "localhost" || originUrl.hostname === "[::1]";
  const identity = resolveBuildIdentity(process.env, {
    environment: isLocal ? "local" : "production"
  });

  return Response.json(
    {
      ...identity,
      // Independent platform identity: never fall back to the supplied release label.
      ...(process.env.VERCEL === "1" && /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA || "")
        ? { platformGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA } : {}),
      origin: originUrl.origin,
      originClassification: isCanonicalLocal ? "canonical-local-review" : isLocal ? "alternate-local" : "production"
    },
    { headers: noStoreHeaders }
  );
}
