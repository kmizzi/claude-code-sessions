import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "bindings",
    "@huggingface/transformers",
    "chokidar",
    "onnxruntime-node",
    "@anthropic-ai/sdk",
  ],
  // Ensure workers and native modules get traced into the standalone bundle
  outputFileTracingIncludes: {
    "/": [
      "./src/workers/**/*",
      "./src/lib/db/schema.sql",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/sqlite-vec/**/*",
    ],
  },
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
