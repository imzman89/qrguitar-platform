import { resolveBuildIdentity } from "./lib/build-identity.mjs";
import { securityHeaders } from "./lib/security-headers.ts";

/** @type {import('next').NextConfig} */
const buildIdentity = resolveBuildIdentity(process.env, {
  environment: "local",
  buildTimestamp: new Date().toISOString(),
  deploymentIdentifier: ""
});

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }
];

// These browser routes can render account-specific tools or accept private tokens.
// Keep this list intentionally narrower than the public marketing and Profile trees.
const privatePageCacheSource = "/:privatePath(account|admin|create|dashboard|edit|handout|login|messages|ownership-claim|reset-password|service-review|service-work|site-editor|transfer)/:path*";

const nextConfig = {
  transpilePackages: ["@qrguitar/shared"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    QRGUITAR_BUILD_ENV: buildIdentity.environment,
    QRGUITAR_GIT_SHA: buildIdentity.gitCommitSha,
    QRGUITAR_BUILD_TIMESTAMP: buildIdentity.buildTimestamp || "",
    QRGUITAR_BUILD_DIRTY: String(buildIdentity.dirtyWorkingTree),
    QRGUITAR_DEPLOYMENT_ID: buildIdentity.deploymentIdentifier || ""
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders()
      },
      {
        source: "/api/:path*",
        headers: noStoreHeaders
      },
      {
        source: privatePageCacheSource,
        headers: noStoreHeaders
      },
      {
        source: "/billing/:path*",
        headers: [...noStoreHeaders, ...securityHeaders({ checkout: true })]
      }
    ];
  }
};

export default nextConfig;
