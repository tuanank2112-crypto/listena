import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Prisma and its libSQL adapter in the Node server bundle boundary.
  // The Vercel target uses the default Node runtime, not OpenNext/Workers.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
