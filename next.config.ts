import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_UML_STORAGE: process.env.UML_PLATFORM === "vercel" || process.env.VERCEL === "1" ? "browser" : "server" },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, resolve(process.cwd(), "db/node-env.ts")));
    return config;
  },
};

export default nextConfig;
