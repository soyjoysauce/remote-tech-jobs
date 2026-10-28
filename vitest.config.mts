import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Reads the `@/*` alias from tsconfig.json so tests and the app resolve imports the same way.
    tsconfigPaths: true,
  },
  test: {
    // Two projects because UI tests need a DOM and server-side code should be tested without one:
    // jsdom replaces Node globals such as fetch and AbortSignal with its own versions.
    // `extends: true` makes each project inherit the plugins and resolve settings above.
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/app/**/*.test.{ts,tsx}",
            "src/components/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/lib/**/*.test.ts", "scripts/**/*.test.ts"],
          // Integration tests need the local Supabase stack: `npm run test:integration`.
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
    ],
  },
});
