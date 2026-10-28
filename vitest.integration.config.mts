import { defineConfig } from "vitest/config";

// Integration tests talk to the local Supabase stack (`npm run db:start`) through the Data API,
// with the secret key from .env.local (locally) or the environment (CI).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    // The tests share one database, so files run one after another.
    fileParallelism: false,
  },
});
