import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE MICROVM HARNESS BUNDLE (MIN-224).
 *
 * A single JS file, written in the microVM by `writeFiles` at startup
 * each turn and launched by `node`. Why a bundle rather than a folder:
 * the VM does not have our `node_modules`, and we are not going to make a `npm install` there
 * minddy deposit before each round. esbuild flattens everything the harness
 * key into a file, and this file only depends on Node.
 *
 * WHAT MUST REMAIN TRUE, and a test holds it
 * ([vm-bundle-secrets.test.ts](../lib/server/agent/vm-bundle-secrets.test.ts)) :
 * **nothing that leaves here should be able to reach a secret** — nor the client
 * Supabase in service key, nor `OPENROUTER_API_KEY`. microVM is the place
 * where the model executes arbitrary shell; a `env` would suffice. The test reads the
 * import graph from THE SAME entry point as this script, and it is
 * voluntary: two hand-written lists would have ended up diverging, and the
 * safeguard would then have kept a bundle which is no longer delivered.
 *
 * `platform: node` and `format: cjs`: the bundle runs under the microVM Node
 * (`node24`), not in a browser or under Next. `packages: bundle` is the
 * default — this is exactly what we want, everything must fit.
 *
 * ⚠ **Wired to `prebuild` AND to `predev`, and the second one was missing for a long time.**
 * `next dev` does not build anything: the bundle read by `vm-launch.ts` remained the one
 * of the last build in hand, and a round launched locally therefore played a harness
 * of another day. Since MIN-354 a PROTOCOL offset is called (“the harness
 * bundle is out of date”); any other harness modification silently played
 * with the old code. It costs 20ms.
 *
 * This only covers STARTING the dev server: edit
 * Editing `lib/server/agent/vm/` while it is running still requires restarting
 * this hand-run script. Knowing this is a reflex; without that, it was a trap.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * Where the bundle lands. OUTSIDE `lib/`, so that neither `tsc` nor vites
 * collect, and under a separate folder so that `outputFileTracingIncludes`
 * (next.config.mjs) can embed it in the functions of a single pattern.
 */
const OUT_DIR = path.join(repo, ".agent-vm");
const OUT_FILE = path.join(OUT_DIR, "main.js");

/**
 * Size ceiling, and it is not cosmetic: the bundle is written in the
 * microVM EVERY round, and it travels in the body of a Sandbox API call.
 * A heavy module accidentally pulled (an SDK, an icon pack, a local
 * complete) would be seen here first. Generous so as not to interfere, firm so that
 * the accident is visible.
 */
const MAX_BUNDLE_BYTES = 4_000_000;

await mkdir(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(repo, "lib/server/agent/vm/main.ts")],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // No minification: when a round breaks in the VM, the call stack is
  // the only thing we have. It must remain readable.
  minify: false,
  sourcemap: false,
  // The `@/…` aliases of the repository. esbuild reads them from tsconfig, but we tell it so
  // explicitly: the file has two `paths` and forgetting it would result in
  // a “Could not resolve” error at build time, never in production.
  tsconfig: path.join(repo, "tsconfig.json"),
  // `server-only` raises on import outside of a React server context. No modules
  // of the bundle should not import it (they have all been cleaned), but if it
  // remained one, better a stub than a crash when starting the VM.
  alias: { "server-only": path.join(dir, "agent-vm-server-only-stub.js") },
  logLevel: "info",
  metafile: true,
});

const { size } = await stat(OUT_FILE);
if (size > MAX_BUNDLE_BYTES) {
  // The five biggest contributors: without them, “the bundle has doubled” is not
  // actionable. With them, you can immediately read what has been entered by mistake.
  const inputs = Object.entries(result.metafile.outputs[path.relative(repo, OUT_FILE)]?.inputs ?? {})
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 5)
    .map(([file, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${file}`)
    .join("\n");
  console.error(
    `[build:agent-vm] bundle is ${(size / 1_000_000).toFixed(2)} MB, above the ${(MAX_BUNDLE_BYTES / 1_000_000).toFixed(1)} MB ceiling.\nLargest contributors:\n${inputs}`,
  );
  process.exit(1);
}

console.log(
  `[build:agent-vm] ${path.relative(repo, OUT_FILE)} — ${(size / 1024).toFixed(0)} Ko`,
);
