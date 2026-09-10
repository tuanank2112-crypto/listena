import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Preserve Prisma's `workerd` export condition for OpenNext. Bundling it
  // as a normal Node package selects the Windows query engine instead.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
