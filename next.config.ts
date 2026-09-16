import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
