// Bundle server-only TypeScript in an ignored local directory for the diagnostic runner.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const referenceRoot = process.env.MINDDY_PERF_REFERENCE_ROOT ? path.resolve(process.env.MINDDY_PERF_REFERENCE_ROOT) : process.cwd();
const bundle = path.join(output, "min614-repositories.mjs");
await build({ entryPoints: ["scripts/performance/measure-min614-repositories.mjs"], outfile: bundle, bundle: true,
  platform: "node", format: "esm", packages: "external", alias: { "server-only": path.resolve("test/server-only-stub.ts"), "@": referenceRoot }, tsconfig: "tsconfig.json",
  plugins: [{ name: "preserve-fixture-module-roots", setup(builder) {
    builder.onResolve({ filter: /^next\/(server|headers|cache|navigation)$/ }, ({ path: input }) => ({ path: path.resolve("node_modules", `${input}.js`), external: true }));
    builder.onResolve({ filter: /\.\.\/\.\.\/lib\/server\/.*\.ts$/ }, ({ path: input }) => ({ path: path.resolve(referenceRoot, "scripts/performance", input) }));
    builder.onResolve({ filter: /(?:captures\/lib\/env|seed)\.mjs$/ }, ({ path: input, resolveDir }) => ({ path: path.resolve(resolveDir, input), external: true }));
  } }],
});
await import(pathToFileURL(bundle).href);
