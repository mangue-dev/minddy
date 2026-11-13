import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The pages bundled in the mobile app (MIN-907).
 *
 * The mobile shell loads the product from the selected server, so the only
 * web content it ships is what must work before any server and without a
 * network: the server choice and the offline screen
 * (`components/mobile/shell.tsx`). Like the desktop welcome page, they are
 * built from the product's components and catalogs, without Next.js
 * (`next-intl` resolves to its runtime, `use-intl`), and styled by the
 * Tailwind tokens compiled for their own files.
 *
 * The output, `mobile/www/`, is Capacitor's `webDir`: `npx cap sync` copies it
 * into the native projects. It is generated and not committed.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const OUT_DIR = path.join(repo, "mobile", "www");

/** Two small pages; a larger file means the product leaked into the bundle. */
const MAX_BUNDLE_BYTES = 450_000;

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const requireRoot = createRequire(path.join(repo, "package.json"));
// `use-intl` as next-intl itself resolves it: it is next-intl's dependency, not
// the app's, so pnpm does not necessarily hoist it to the root.
const useIntlEntry = createRequire(requireRoot.resolve("next-intl")).resolve("use-intl");
let useIntlDirectory = path.dirname(useIntlEntry);
while (path.basename(useIntlDirectory) !== "use-intl") useIntlDirectory = path.dirname(useIntlDirectory);

const shell = await build({
  entryPoints: [path.join(repo, "components", "mobile", "shell-entry.tsx")],
  outfile: path.join(OUT_DIR, "shell.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  // Capacitor 8 supports iOS 15 and later.
  target: "safari15",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  alias: { "next-intl": useIntlDirectory },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  tsconfig: path.join(repo, "tsconfig.json"),
  logLevel: "warning",
  metafile: true,
});

const cssInput = path.join(repo, "components", "mobile", "shell.css");
// PostCSS as the Tailwind plugin resolves it: it is that plugin's dependency
// (the root only pins its version in overrides), so pnpm may not hoist it.
const tailwindPluginEntry = requireRoot.resolve("@tailwindcss/postcss");
const { default: postcss } = await import(pathToFileURL(createRequire(tailwindPluginEntry).resolve("postcss")).href);
const { default: tailwind } = await import(pathToFileURL(tailwindPluginEntry).href);
const css = await postcss([tailwind({ base: repo, optimize: { minify: true } })]).process(
  await readFile(cssInput, "utf8"),
  { from: cssInput, to: path.join(OUT_DIR, "shell.css") },
);
await writeFile(path.join(OUT_DIR, "shell.css"), css.css);
await copyFile(path.join(repo, "app", "fonts", "inter-latin.woff2"), path.join(OUT_DIR, "inter-latin.woff2"));

/**
 * A document that loads nothing but its own files: no network, no inline
 * script. `connect-src` stays closed too: the page talks to the shell through
 * Capacitor's message handler, not over HTTP.
 */
function page(screen) {
  return `<!doctype html>
<html lang="en" data-screen="${screen}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:">
    <meta name="color-scheme" content="light dark">
    <title>minddy</title>
    <link rel="stylesheet" href="shell.css">
    <script type="module" src="shell.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
}
await writeFile(path.join(OUT_DIR, "index.html"), page("server"));
await writeFile(path.join(OUT_DIR, "offline.html"), page("offline"));

for (const file of Object.keys(shell.metafile.outputs)) {
  const { size } = await stat(path.resolve(process.cwd(), file));
  if (size > MAX_BUNDLE_BYTES) {
    const inputs = Object.entries(shell.metafile.outputs[file].inputs)
      .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
      .slice(0, 5)
      .map(([name, input]) => `  ${(input.bytesInOutput / 1024).toFixed(0)} KB  ${name}`)
      .join("\n");
    console.error(
      `[build:mobile] ${file} is ${(size / 1024).toFixed(0)} KB, above the ${(MAX_BUNDLE_BYTES / 1024).toFixed(0)} KB ceiling.\nLargest contributors:\n${inputs}`,
    );
    process.exit(1);
  }
  console.log(`[build:mobile] ${file} — ${(size / 1024).toFixed(1)} KB`);
}
console.log(`[build:mobile] ${path.relative(process.cwd(), path.join(OUT_DIR, "shell.css"))} — ${(css.css.length / 1024).toFixed(1)} KB`);
