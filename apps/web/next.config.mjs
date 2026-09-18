import { resolveBuildIdentity } from "./lib/build-identity.mjs";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests"
    ].join("; ")
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()"
  }
];

const buildIdentity = resolveBuildIdentity(process.env, {
  environment: "local",
  buildTimestamp: new Date().toISOString(),
  deploymentIdentifier: ""
});

const nextConfig = {
  transpilePackages: ["@qrguitar/shared"],
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
          ...securityHeaders
        ]
      }
    ];
  }
};

export default nextConfig;
