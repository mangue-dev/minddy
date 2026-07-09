import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests target the pure libs only (lib/cycle.ts & friends) — plain node,
// no jsdom, no React. The alias mirrors tsconfig's "@/*" → repo root.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
