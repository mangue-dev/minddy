import { build } from "esbuild";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestCompatibilityEntry } from "../lib/self-hosting-release-core.mjs";

/**
 * THE ELECTRON SHELL BUNDLE (MIN-291).
 *
 * Two files, and two only: the main process and the preload. They
 * import from `lib/desktop/` (the navigation guard, the deep link parsing,
 * the bridge contract), which is the TypeScript of the repository with its aliases `@/…` — a
 * bundle is therefore the shortest way to get JS that Electron loads tel
 * which, without `node_modules` to install in the app.
 *
 * The preload is bundled **in CJS and without `sandbox: false`**: in a renderer
 * in `sandbox: true`, Electron loads the preload in a restricted context which
 * only knows `require('electron')` and a few modules — no ESM, no
 * `node_modules`. Everything it touches must therefore be IN the file.
 *
 * Nothing bundled here must draw from React, Next or code
 * server: hence the cap below, which makes the crash visible at build
 * rather than in a signed app. This is the same safeguard as the
 * microVM bundle, for the same reason — what goes out to people doesn't get read again.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const OUT_DIR = path.join(repo, "desktop", "dist");

/** A THIN shell (§1 of docs/desktop-electron.md): main + preload, in KB. */
const MAX_BUNDLE_BYTES = 200_000;

await mkdir(OUT_DIR, { recursive: true });

/**
 * THE VERSION OF THE APP IS THAT OF THE DEPOSIT (MIN-292).
 *
 * A single number for the web app and the shell, and this is not a vanity
 * of storage: the shell is a window on `www.minddy.app`, therefore " what
 * version of minddy is this? » has only one honest answer. Two distinct
 * numbers would require translating from one to the other to read a bug report — the user agent window (`minddy-desktop/<version>`) and the
 * "About" window both carry this number.
 *
 * **It is copied rather than derived at runtime** because it is
 * electron-builder which reads it, in `desktop/package.json`, and it only knows
 * this file. Seeing it move in a diff is therefore normal, and that's even the point: a publication accompanies it, not the other way around.
 *
 * **What it doesn't trigger**: an update among people. The feed
 * only announces what has been published (`latest-mac.yml`); mount this number without
 * publishing binary doesn't tell anyone anything.
 */
const repoPkgPath = path.join(repo, "package.json");
const desktopPkgPath = path.join(repo, "desktop", "package.json");
const { version } = JSON.parse(await readFile(repoPkgPath, "utf8"));
const desktopPkgRaw = await readFile(desktopPkgPath, "utf8");
const desktopPkg = JSON.parse(desktopPkgRaw);

if (desktopPkg.version !== version) {
  const previous = desktopPkg.version;
  desktopPkg.version = version;
  // Targeted rewriting of the file as it is written, including indentation:
  // `JSON.stringify` would reformat the entire file for a single field.
  await writeFile(
    desktopPkgPath,
    desktopPkgRaw.replace(
      /"version":\s*"[^"]*"/,
      `"version": ${JSON.stringify(version)}`
    )
  );
  console.log(`[build:desktop] version ${previous} → ${version} (repository version)`);
}

/**
 * The release the desktop installer clones (MIN-781): the newest published
 * compatibility row, the same one the public installation wizard links to.
 * Injected as a constant so the shell does not bundle the whole table.
 */
const compatibility = JSON.parse(
  await readFile(path.join(repo, "deploy", "self-hosted", "compatibility.json"), "utf8")
);
const selfHostingRelease = latestCompatibilityEntry(compatibility.entries).minddyRelease;

const result = await build({
  entryPoints: [
    path.join(repo, "desktop", "src", "main.ts"),
    path.join(repo, "desktop", "src", "preload.ts"),
  ],
  outdir: OUT_DIR,
  bundle: true,
  platform: "node",
  format: "cjs",
  // Electron 43 ships Node 24 — measured in MIN-290, which is also the target of the
  // bundle du harness de l'agent (§7.3).
  target: "node24",
  // `electron` is provided by the runtime, never by us. `electron-updater`,
  // however, is a real npm dependency: electron-builder packages it in the app
  // (from its production `node_modules`) and loads it through `require` at runtime.
  // Bundling it here would include it twice — and, most importantly, it reads
  // `app-update.yml` through its own package path.
  external: ["electron", "electron-updater"],
  define: { __MINDDY_SELF_HOSTING_RELEASE__: JSON.stringify(selfHostingRelease) },
  // No minification: when the shell breaks for someone, the call stack is all we have.
  minify: false,
  sourcemap: false,
  tsconfig: path.join(repo, "desktop", "tsconfig.json"),
  logLevel: "info",
  metafile: true,
});

// Metafile paths are relative to the CURRENT DIRECTORY, not the repository:
// this script runs from either the root or `desktop/`.
for (const [file, output] of Object.entries(result.metafile.outputs)) {
  const { size } = await stat(path.resolve(process.cwd(), file));
  if (size > MAX_BUNDLE_BYTES) {
    const inputs = Object.entries(output.inputs)
      .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
      .slice(0, 5)
      .map(([f, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${f}`)
      .join("\n");
    console.error(
      `[build:desktop] ${file} is ${(size / 1024).toFixed(0)} KB, above the ${(MAX_BUNDLE_BYTES / 1024).toFixed(0)} KB ceiling.\nLargest contributors:\n${inputs}`
    );
    process.exit(1);
  }
  console.log(`[build:desktop] ${file} — ${(size / 1024).toFixed(1)} Ko`);
}

/**
 * The server-choice page (MIN-781): a React page of the web app, shipped in
 * the desktop app so that choosing a server works before any server and
 * offline. Bundled without Next.js (`next-intl` resolves to its runtime,
 * `use-intl`), styled by the product's Tailwind tokens compiled for its own
 * files, and served by the shell from `minddy-app://welcome/`. Minified, unlike
 * the main process: this is a page, and its stack traces stay in DevTools.
 */
const WELCOME_DIR = path.join(OUT_DIR, "welcome");
const MAX_WELCOME_BYTES = 450_000;
await mkdir(WELCOME_DIR, { recursive: true });
const requireRoot = createRequire(path.join(repo, "package.json"));
const welcome = await build({
  entryPoints: [path.join(repo, "components", "desktop", "server-choice-entry.tsx")],
  outfile: path.join(WELCOME_DIR, "welcome.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome140",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  alias: { "next-intl": "use-intl" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  tsconfig: path.join(repo, "tsconfig.json"),
  logLevel: "warning",
  metafile: true,
});
const welcomeCssInput = path.join(repo, "components", "desktop", "server-choice.css");
const { default: postcss } = await import(requireRoot.resolve("postcss"));
const { default: tailwind } = await import(requireRoot.resolve("@tailwindcss/postcss"));
const welcomeCss = await postcss([tailwind({ base: repo, optimize: { minify: true } })]).process(
  await readFile(welcomeCssInput, "utf8"),
  { from: welcomeCssInput, to: path.join(WELCOME_DIR, "welcome.css") },
);
await writeFile(path.join(WELCOME_DIR, "welcome.css"), welcomeCss.css);
await copyFile(path.join(repo, "app", "fonts", "inter-latin.woff2"), path.join(WELCOME_DIR, "inter-latin.woff2"));
// A document that loads nothing but its own files: no network, no inline script.
await writeFile(
  path.join(WELCOME_DIR, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:">
    <meta name="color-scheme" content="light dark">
    <title>minddy</title>
    <link rel="stylesheet" href="/welcome.css">
    <script type="module" src="/welcome.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
);
for (const file of Object.keys(welcome.metafile.outputs)) {
  const { size } = await stat(path.resolve(process.cwd(), file));
  if (size > MAX_WELCOME_BYTES) {
    console.error(`[build:desktop] ${file} is ${(size / 1024).toFixed(0)} KB, above the ${(MAX_WELCOME_BYTES / 1024).toFixed(0)} KB ceiling.`);
    process.exit(1);
  }
  console.log(`[build:desktop] ${file} — ${(size / 1024).toFixed(1)} Ko`);
}
console.log(`[build:desktop] ${path.relative(process.cwd(), path.join(WELCOME_DIR, "welcome.css"))} — ${(welcomeCss.css.length / 1024).toFixed(1)} Ko`);
