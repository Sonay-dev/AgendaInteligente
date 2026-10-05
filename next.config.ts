import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;

// Disponibiliza os bindings do wrangler (D1, secrets do .dev.vars) no `next dev`.
initOpenNextCloudflareForDev();
