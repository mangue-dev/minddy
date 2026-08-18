import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests target the pure libs only (lib/cycle.ts & friends) — plain node,
// no jsdom, no React. The alias mirrors tsconfig's "@/*" → repo root; the
// "server-only" one is a no-op stub, so a module that is pure but carries Next's
// server guard (lib/server/agent/tools.ts) stays testable.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tools/**/*.test.ts"],
    // The page projection bundle (MIN-295): the projection loads it
    // by path, so it must exist before the first test that passes through it.
    globalSetup: ["test/build-pages-md-setup.ts"],
  },
});
