import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests use Node by default; DOM suites opt into jsdom per file. Resolve the
// application alias and stub Next's server guard for server modules under test.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["{lib,components,tools}/**/*.test.{ts,tsx}"],
    // The page projection bundle (MIN-295): the projection loads it
    // by path, so it must exist before the first test that passes through it.
    globalSetup: ["test/build-pages-md-setup.ts"],
  },
});
