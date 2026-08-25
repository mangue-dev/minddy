import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE IMPRINT OF THE SHELL (MIN-292) — “should we republish the native app? »
 *
 * The desktop app is a window into `www.minddy.app`: deploying the site just
 * changes what it displays, and **most deployments don't concern it at all**. Republishing a binary means twenty minutes of notarization and 120 MB that each user will download. So you have to
 * know how to answer the question without relying on instinct.
 *
 * **What matters is not “have I touched `desktop/`”.** esbuild bundle also
 * what these files import, and the list surprises — `lib/public-routes.ts` en
 * is part, because the navigation guard derives from it. We therefore ask
 * esbuild itself which files go into the bundle, rather than maintaining a
 * list by hand which would get out of sync at the first added import.
 *
 * **And what matters even less is the VERSION.** The number is rewritten to
 * each build from that of the repository: taking this into account would cause
 * to republish the app each time the site is deployed, that is to say exactly what we are trying to
 * to avoid. Same reason for two other contents that enter the bundle without
 * change anything about its behavior — see `NORMALIZE`.
 *
 * node scripts/desktop-fingerprint.mjs # the fingerprint
 * node scripts/desktop-fingerprint.mjs --explain # what has changed since publication
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * What goes into the binary WITHOUT going through esbuild: the packaging itself.
 * Changing the icon, entitlements, or a build target produces a different app
 *, without a single line of TypeScript having moved.
 */
const PACKAGING_INPUTS = [
  "desktop/electron-builder.yml",
  "desktop/build/entitlements.mac.plist",
  // The translations of `Info.plist`, posed by `extraResources` (MIN-359).
  // They are not entered by esbuild and are not named in any file
  // TypeScript: without this line, correct the French sentence of a request
  // authorization produced a DIFFERENT app that the fingerprint declared "to
  // day ". This is exactly the lie that this script exists to prevent.
  "desktop/build/fr.lproj",
  // Microsoft Store tile assets are injected directly by electron-builder.
  "desktop/build/appx",
  // The Windows executable icon is injected directly by electron-builder.
  "desktop/build/icon-windows.png",
  // The Icon Composer source is a FILE (`icon.json` + the SVG): it is
  // unfolded file by file, cf. `expandDirectories`.
  "desktop/build/icon.icon",
  // The bundler options are part of what is produced.
  "scripts/build-desktop.mjs",
  // For VERSIONS of electron and electron-updater — see NORMALIZE, which
  // remove the version number from the app.
  "desktop/package.json",
];

/**
 * What goes into the bundle but says NOTHING about its behavior. Each
 * entry is a decision, and each one cost some thought:
 *
 * - `desktop/package.json` — the version number, rewritten with each build from
 * that of the repository. Without this cut, any deployment of the site would republish
 * the app. The rest of the file (the dependencies, therefore the version of Electron)
 * counts.
 * - `lib/changelog.ts` — enters the bundle only by ricochet
 * (`CHANGELOG_LAST_MODIFIED`, read by `public-routes.ts`), and does not bring that a
 * DATE. Without this cut, publishing something new would cause
 * to download 120 MB for nothing.
 * - `lib/public-routes.ts` — its `lastModified` are held by hand for the
 * sitemap (see CLAUDE.md) and move with each retouched page. The shell,
 * only reads PATHS. The rest of the file matters: **add a
 * public page MUST republish the app**, otherwise existing installations
 * would display it in the window instead of opening it in the
 * browser.
 */
const NORMALIZE = {
  "desktop/package.json": (src) => src.replace(/"version":\s*"[^"]*"/, '"version":"·"'),
  "lib/changelog.ts": () => "",
  "lib/public-routes.ts": (src) => src.replace(/^\s*lastModified:.*$/gm, ""),
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Files that esbuild actually includes in the bundle. */
async function bundleInputs() {
  const result = await build({
    entryPoints: [
      path.join(repo, "desktop", "src", "main.ts"),
      path.join(repo, "desktop", "src", "preload.ts"),
    ],
    outdir: path.join(repo, "desktop", "dist"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron", "electron-updater"],
    tsconfig: path.join(repo, "desktop", "tsconfig.json"),
    // We only want the list: nothing is written to disk.
    write: false,
    metafile: true,
    logLevel: "silent",
  });

  const inputs = new Set();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const input of Object.keys(output.inputs)) inputs.add(input);
  }
  return [...inputs];
}

/**
 * Expands directory entries into their files, using paths relative to the
 * repository. An entry in `PACKAGING_INPUTS` can be one since the icon became
 * an Icon Composer source: keeping file-by-file detail lets `--explain` say
 * *what* changed in the icon.
 */
async function expandDirectories(entries) {
  const files = [];
  for (const entry of entries) {
    if ((await stat(path.join(repo, entry))).isDirectory()) {
      for (const name of await readdir(path.join(repo, entry), { recursive: true })) {
        const child = path.join(entry, name);
        if ((await stat(path.join(repo, child))).isFile()) files.push(child);
      }
    } else {
      files.push(entry);
    }
  }
  return files;
}

/**
 * The fingerprint and per-file detail — this detail lets us SAY what changed
 * instead of announcing that “something changed”.
 */
export async function computeDesktopFingerprint() {
  const files = [...(await bundleInputs()), ...(await expandDirectories(PACKAGING_INPUTS))].sort();
  const perFile = {};

  for (const file of files) {
    const raw = await readFile(path.join(repo, file));
    const normalize = NORMALIZE[file];
    const content = normalize ? normalize(raw.toString("utf8")) : raw;
    // A fully neutralized file is not part of the fingerprint: listing it with
    // a constant hash would make it appear to count.
    if (normalize && content === "") continue;
    perFile[file] = sha256(content);
  }

  const fingerprint = sha256(
    Object.entries(perFile)
      .map(([file, hash]) => `${file}:${hash}`)
      .join("\n")
  );
  return { fingerprint, files: perFile };
}

/** Changes between two snapshots — additions, removals, modifications. */
export function diffFingerprints(published = {}, current = {}) {
  const names = [...new Set([...Object.keys(published), ...Object.keys(current)])].sort();
  return names
    .filter((name) => published[name] !== current[name])
    .map((name) => ({
      file: name,
      change: !published[name] ? "added" : !current[name] ? "removed" : "modified",
    }));
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { fingerprint, files } = await computeDesktopFingerprint();

  if (!process.argv.includes("--explain")) {
    console.log(fingerprint);
  } else {
    const released = await readFile(path.join(repo, "desktop", "released.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null);

    if (!released) {
      console.log("No publication recorded (desktop/released.json is missing).");
      console.log(`Current fingerprint: ${fingerprint}`);
    } else if (released.fingerprint === fingerprint) {
      console.log(`Up to date — published in ${released.version}, fingerprint ${fingerprint.slice(0, 12)}.`);
    } else {
      console.log(`Published: ${released.version} (${released.fingerprint.slice(0, 12)})`);
      console.log(`Current: ${fingerprint.slice(0, 12)}`);
      console.log("");
      for (const { file, change } of diffFingerprints(released.files, files)) {
        console.log(`  ${change.padEnd(9)} ${file}`);
      }
    }
  }
}
