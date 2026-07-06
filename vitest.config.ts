import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

const alias = { "@": path.resolve(__dirname, "./src") };

// Two projects:
//  - "node": existing React / i18n / AI / CSV tests run in the Node environment.
//  - "workers": the dictionary scraper test runs inside workerd so it exercises
//    the real HTMLRewriter (the scraper relies on Workers-native streaming HTML
//    parsing that cannot be faithfully mocked in Node).
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            ...alias,
            // `cloudflare:workers` is a virtual module supplied at build/runtime
            // by @astrojs/cloudflare; stub it so endpoint modules load under Node.
            "cloudflare:workers": path.resolve(__dirname, "./src/test/cloudflare-workers.stub.ts"),
          },
        },
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/lib/services/dictionary.test.ts"],
        },
      },
      defineWorkersProject({
        resolve: { alias },
        test: {
          name: "workers",
          globals: true,
          include: ["src/lib/services/dictionary.test.ts"],
          poolOptions: {
            workers: {
              miniflare: {
                compatibilityDate: "2026-05-08",
                compatibilityFlags: ["nodejs_compat"],
              },
            },
          },
        },
      }),
      {
        // "integration": API authorization tests against a real local Supabase.
        // Kept OUT of the default `npm test` run (see package.json scripts) and
        // self-skipping when no Supabase env is present, so it never breaks CI
        // before the quality-gate wiring lands (test-plan §3 Phase 5).
        // Run on demand: `npm run test:integration` (requires `npx supabase start`).
        plugins: [react()],
        resolve: {
          alias: {
            ...alias,
            "cloudflare:workers": path.resolve(__dirname, "./src/test/cloudflare-workers.stub.ts"),
            "astro:env/server": path.resolve(__dirname, "./src/test/astro-env-server.stub.ts"),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/helpers/env.ts"],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
