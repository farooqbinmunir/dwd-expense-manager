import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Runs against a local Supabase stack (`npx supabase start`) – see README.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
