import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Receipts (photos / PDFs) are uploaded through Server Actions.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
