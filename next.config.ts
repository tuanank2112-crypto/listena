import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Report-only first (Plan13 P130 §7): the browser reports violations to the
 * console without blocking anything, so the policy can be tightened once the
 * reports are clean. React needs `eval` only for its development tooling.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://vyceai.com",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Prisma and its libSQL adapter in the Node server bundle boundary.
  // The Vercel target uses the default Node runtime, not OpenNext/Workers.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
          // HSTS only where TLS is guaranteed; a local HTTP dev server must
          // never teach the browser to refuse plain http://localhost.
          ...(isProduction
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
