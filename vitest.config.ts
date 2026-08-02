import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    wrangler: { configPath: "./wrangler.jsonc" },
  })],
  test: {
    include: ["test/**/*.test.ts"],
    maxWorkers: 4,
  },
});
