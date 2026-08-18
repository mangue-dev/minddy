import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE PAGES MARKDOWN SCREENING BUNDLE (MIN-295).
 *
 * `lib/pages-markdown.ts` mounts a tiptap editor to translate a page into
 * both directions. Passed through the Next bundler, this module is DEAD on the server side,
 * and not for a runtime reason:
 *
 *     // @tiptap/core, elementFromString
 *     if (typeof window === "undefined") throw new Error("[tiptap error]: …")
 *
 * Next substitutes `typeof window` → `"undefined"` in the server build. There
 * condition becomes constant, the function is reduced to an unconditional `throw`
 * — measured in `.next/server/chunks`: `function iQ(e){throw Error("[tiptap
 * error]: there is no window object available…")}`. Any markdown read
 * by an agent (MCP, Numo, code agent) fell there, regardless of the content.
 *
 * Hence this bundle, based on the already proven pattern of the microVM harness
 * (`scripts/build-agent-vm.mjs`): esbuild does not substitute `typeof window`, the
 * guard remains a runtime test, and jsdom has already satisfied it when the
 * projection calls it (see `ensurePageDom`, lib/server/pages-projection.ts).
 *
 * The produced file is loaded BY PATH, never imported: this is what puts it
 * out of scope of the bundler, and that's also why `outputFileTracingIncludes`
 * (next.config.ts) must explicitly embed it in the functions.
 *
 * Why not `serverExternalPackages`, the shortest to write: `tiptap-markdown`
 * and `@tiptap/extension-unique-id` publishes an entry point `require`,
 * but their `package.json` carries `"type": "module"` — Node therefore treats them as
 * ESM, and the Vercel function runs with `--no-experimental-require-module`.
 * `node --no-experimental-require-module -e "require('tiptap-markdown')"` raises
 * `ERR_REQUIRE_ESM`. This is exactly the trap already caught with jsdom, and it would
 * only appear in production.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * Where the bundle lands. OUTSIDE `lib/`, so that neither `tsc` nor vites
 * collect, and under a separate folder so that `outputFileTracingIncludes`
 * can take it on board with a single rule, for the same reason and in the same form as
 * `.agent-vm/`.
 */
const OUT_DIR = path.join(repo, ".pages-md");
const OUT_FILE = path.join(OUT_DIR, "main.js");

/**
 * Size ceiling. The bundle is `require()` once per instance of
 * function: what it weighs is cold analysis time, on the first
 * page call of each instance. A heavy module accidentally pulled from a
 * the registry would first be seen here.
 */
const MAX_BUNDLE_BYTES = 2_500_000;

await mkdir(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(repo, "lib/pages-markdown.ts")],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // No minification: the bundle test reads the guard `typeof window` in the
  // text produced, and a call stack from here should read.
  minify: false,
  sourcemap: false,
  // The repository's `@/…` aliases — the projection imports the block register through there.
  tsconfig: path.join(repo, "tsconfig.json"),
  alias: {
    // See both stubs for why. `server-only` out of caution (none
    // module of this graph does not matter today), `lucide-react` for good:
    // it weighs 971 KB of menu icons whose projection has no use.
    "server-only": path.join(dir, "agent-vm-server-only-stub.js"),
    "lucide-react": path.join(dir, "pages-md-lucide-stub.js"),
  },
  logLevel: "warning",
  metafile: true,
});

const { size } = await stat(OUT_FILE);
if (size > MAX_BUNDLE_BYTES) {
  const inputs = Object.entries(
    result.metafile.outputs[path.relative(repo, OUT_FILE)]?.inputs ?? {},
  )
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 5)
    .map(([file, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${file}`)
    .join("\n");
  console.error(
    `[build:pages-md] bundle is ${(size / 1_000_000).toFixed(2)} MB, above the ${(MAX_BUNDLE_BYTES / 1_000_000).toFixed(1)} MB ceiling.\nLargest contributors:\n${inputs}`,
  );
  process.exit(1);
}

console.log(
  `[build:pages-md] ${path.relative(repo, OUT_FILE)} — ${(size / 1024).toFixed(0)} Ko`,
);
