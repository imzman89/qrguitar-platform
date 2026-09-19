import { resolveBuildIdentity } from "./lib/build-identity.mjs";
import { securityHeaders } from "./lib/security-headers.ts";

/** @type {import('next').NextConfig} */
const buildIdentity = resolveBuildIdentity(process.env, {
  environment: "local",
  buildTimestamp: new Date().toISOString(),
  deploymentIdentifier: ""
});

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
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
          ...securityHeaders()
        ]
      },
      {
        source: "/billing/:path*",
        headers: securityHeaders({ checkout: true })
      }
    ];
  }
};

export default nextConfig;
