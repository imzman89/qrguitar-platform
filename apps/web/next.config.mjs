import { securityHeaders } from "./lib/security-headers.ts";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@qrguitar/shared"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    QRGUITAR_BUILD_ENV: process.env.QRGUITAR_BUILD_ENV || (process.env.VERCEL ? "production" : "local"),
    QRGUITAR_GIT_SHA: process.env.QRGUITAR_GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    QRGUITAR_BUILD_TIMESTAMP: process.env.QRGUITAR_BUILD_TIMESTAMP || new Date().toISOString(),
    QRGUITAR_BUILD_DIRTY: process.env.QRGUITAR_BUILD_DIRTY || "false",
    QRGUITAR_DEPLOYMENT_ID:
      process.env.QRGUITAR_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ""
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
