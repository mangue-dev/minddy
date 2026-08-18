import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

import { computeDesktopFingerprint } from "./desktop-fingerprint.mjs";

/**
 * PUBLISH DESKTOP APP FLOW (MIN-292).
 *
 * electron-builder produced `desktop/release/` ; this script pushes the useful content
 * into Vercel Blob, under the prefix `desktop/`. This is all the “storage
 * any” of §5 of the framework: the update flow does not need anything
 * other than a folder served in HTTPS with stable names.
 *
 * MINDDY_DESKTOP_FEED_URL=https://…/desktop \
 * BLOB_READ_WRITE_TOKEN=… \
 * node scripts/publish-desktop.mjs
 *
 * **`addRandomSuffix: false` is not a preference**: filenames
 * ARE flow contract. `latest-mac.yml` cites them, electron-updates them
 * resolves relative to the base URL, and a random suffix would break the link
 * between the manifest and the binaries it announces.
 *
 * **Three rejections, before the first byte sent.** They are there because the three corresponding faults are MUTE: an unsigned app installs and will never update (Squirrel.Mac requires a signed app); a non
 * notarized app does not open with anyone, and the build only does a `warn` when it
 * skips the step; a `app-update.yml` without a URL results in an app that doesn't look for
 * anywhere. In all three cases nothing breaks on publication, and everything is broken in people.
 */

const exec = promisify(execFile);

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const RELEASE_DIR = path.join(repo, "desktop", "release");
const PREFIX = "desktop";

/** What leaves: the binaries, their blockmaps (deltas) and the manifest. */
const PUBLISHED = /\.(dmg|zip|blockmap)$|^latest-mac\.yml$/;

function fail(message) {
  console.error(`[publish-desktop] ${message}`);
  process.exit(1);
}

const verifyOnly = process.argv.includes("--verify-only");
const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!verifyOnly && !token) fail("BLOB_READ_WRITE_TOKEN is missing — nothing to publish without a store.");

const feedUrl = process.env.MINDDY_DESKTOP_FEED_URL?.trim();
if (!feedUrl) {
  fail(
    "MINDDY_DESKTOP_FEED_URL is missing. It is the same URL as the `publish` block " +
      "in desktop/electron-builder.yml; without it, the packaged app looks nowhere."
  );
}

let entries;
try {
  entries = await readdir(RELEASE_DIR);
} catch {
  fail(`${path.relative(repo, RELEASE_DIR)} does not exist — run \`npm --prefix desktop run dist\` first.`);
}

if (!entries.includes("latest-mac.yml")) {
  fail("latest-mac.yml is missing: without a manifest, there is no feed, only files.");
}

// Refusal 1 — the app must be signed. `codesign -dv` fails (code ≠ 0) on a
// unsigned bundle, and this is exactly the case we want to catch.
const apps = [];
for (const arch of ["mac-arm64", "mac"]) {
  const app = path.join(RELEASE_DIR, arch, "minddy.app");
  try {
    await stat(app);
    apps.push(app);
  } catch {
    // This architecture has not been built: `latest-mac.yml` does not
    // won't announce it either, nothing to check.
  }
}
if (apps.length === 0) fail("no `minddy.app` in desktop/release — the build did not complete.");

for (const app of apps) {
  try {
    await exec("codesign", ["-dv", "--verbose=2", app]);
  } catch {
    fail(
      `${path.relative(repo, app)} is NOT signed. Squirrel.Mac requires a signed app: ` +
        "publishing it would produce an app that installs but never updates. " +
        "See docs/desktop-release.md."
    );
  }
}

// Refusal 2 — the app is NOTARIZED, and the ticket is stapled.
//
// Signed is not enough: Gatekeeper also wants Apple to have looked. And the lack
// is not seen in the build — when the `notarytool` identifiers are missing,
// electron-builder writes `skipped macOS notarization` to `warn` in the middle of hundred
// lines and renders a signed, non-notarized, normal-looking app. She doesn't
// would open in anyone's home. `stapler validate` is what decides: he reads the
// ticket IN the bundle, without network, exactly like the Mac opposite will do.
for (const app of apps) {
  try {
    await exec("xcrun", ["stapler", "validate", app]);
  } catch {
    fail(
      `${path.relative(repo, app)} has no stapled notarization ticket. ` +
        "macOS will refuse to open it. The build probably wrote " +
        "`skipped macOS notarization` — check APPLE_KEYCHAIN_PROFILE, then " +
        "docs/desktop-release.md."
    );
  }
}

// Refusal 3 — the `app-update.yml` of the bundle bears the URL of the flow. This is the
// file that electron-updater reads, and it is written at packaging time:
// an absent `MINDDY_DESKTOP_FEED_URL` THIS day is not seen anywhere else.
for (const app of apps) {
  const inside = path.join(app, "Contents", "Resources", "app-update.yml");
  const content = await readFile(inside, "utf8").catch(() => "");
  if (!/^url:\s*\S+/m.test(content)) {
    fail(
      `${path.relative(repo, inside)} has no feed URL: the packaged app would look for ` +
        "no updates. Rebuild with MINDDY_DESKTOP_FEED_URL set."
    );
  }
}

// **It is the MANIFESTO that decides what goes, not the contents of the file.**
// `desktop/release/` is not cleaned between two builds: the binaries of one
// previous version remain there, and a scan of the folder would republish them — from
// dead weight in the store, and a `.zip` of a version that the flow does not announce
// anymore. We therefore publish only what `latest-mac.yml` cites, plus its blockmaps
// (the deltas, which he does not cite but which electron-updater will look for next).
//
// Reading `url:` is deliberately lowercase and duplicates three lines of
// lib/desktop/update-feed.ts (the other reader of the same file, site side):
// importing TypeScript from the repository into a `.mjs` script would cost more than
// these three lines.
const manifest = await readFile(path.join(RELEASE_DIR, "latest-mac.yml"), "utf8");
const referenced = [...manifest.matchAll(/^\s*-\s*url:\s*(.+)$/gm)].map((m) =>
  m[1].trim().replace(/^['"]|['"]$/g, "")
);
if (referenced.length === 0) fail("latest-mac.yml announces no files.");

const missing = referenced.filter((name) => !entries.includes(name));
if (missing.length > 0) {
  fail(`manifest announces files missing from the directory: ${missing.join(", ")}`);
}

const files = entries
  .filter(
    (name) =>
      name === "latest-mac.yml" ||
      referenced.includes(name) ||
      (name.endsWith(".blockmap") && referenced.includes(name.slice(0, -".blockmap".length)))
  )
  .sort();

const skipped = entries.filter((name) => PUBLISHED.test(name) && !files.includes(name));
// A silent ceiling is misleading: SAY what we leave behind.
if (skipped.length > 0) {
  console.log(
    `[publish-desktop] skipped (outside the manifest, probably from an earlier build): ${skipped.join(", ")}`
  );
}
if (files.length === 0) fail("nothing to publish in desktop/release.");

// The manifesto LAST, always. He is what announces a version; THE
// publish before its binaries opens a window, short but real, during
// which each installed app downloads a 404.
files.sort((a, b) => Number(a === "latest-mac.yml") - Number(b === "latest-mac.yml"));

if (verifyOnly) {
  console.log(`[publish-desktop] verification only: ${files.length} files ready (${files.join(", ")}).`);
  process.exit(0);
}

for (const name of files) {
  const body = await readFile(path.join(RELEASE_DIR, name));
  const { url } = await put(`${PREFIX}/${name}`, body, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    // The manifest is reread at each check: cache it long
    // would make an outdated version live long after its replacement. Binaries,
    // they are immutable — their name bears their version.
    cacheControlMaxAge: name === "latest-mac.yml" ? 60 : 31_536_000,
  });
  console.log(`[publish-desktop] ${name} → ${url}`);
}

/**
 * The statement of what has just been published — `desktop/released.json`, COMMITTEE.
 *
 * This is what allows `npm run deploy` to respond “should we republish
 * the app? » without asking anyone: it compares the fingerprint of the deposit to
 * this one. A versioned file rather than a network call, so that the response
 * is read in a diff and an offline deployment remains possible.
 *
 * It is written AFTER sending, never before: a statement announcing a failed publication would skip all deployments following.
 */
const version = JSON.parse(
  await readFile(path.join(repo, "desktop", "package.json"), "utf8")
).version;
const { fingerprint, files: fingerprintFiles } = await computeDesktopFingerprint();
await writeFile(
  path.join(repo, "desktop", "released.json"),
  `${JSON.stringify(
    { version, publishedAt: new Date().toISOString(), fingerprint, files: fingerprintFiles },
    null,
    2
  )}\n`
);

console.log(
  `[publish-desktop] ${files.length} files published in ${version} (fingerprint ${fingerprint.slice(0, 12)}).`
);
console.log("[publish-desktop] desktop/released.json updated — COMMIT THIS FILE.");
