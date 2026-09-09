import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

import { computeDesktopFingerprint } from "./desktop-fingerprint.mjs";
import { requireMacReleaseArtifacts } from "./macos-desktop-release.mjs";

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

/** Verify the complete signed bundle, including nested helpers and its ticket. */
async function verifyMacApp(app, label) {
  try {
    await exec("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  } catch {
    throw new Error(`${label} failed strict codesign verification.`);
  }
  try {
    await exec("spctl", ["-a", "-vvv", app]);
  } catch {
    throw new Error(`${label} was rejected by Gatekeeper assessment.`);
  }
  try {
    await exec("xcrun", ["stapler", "validate", app]);
  } catch {
    throw new Error(`${label} has no valid stapled notarization ticket.`);
  }
}

/** Verify that every archive contains the same valid app that was built. */
async function verifyMacArchive(archive) {
  const extraction = await mkdtemp(path.join(os.tmpdir(), "minddy-macos-release-"));
  let mounted = false;
  try {
    let app;
    if (archive.endsWith(".zip")) {
      await exec("ditto", ["-x", "-k", archive, extraction]);
      app = path.join(extraction, "minddy.app");
    } else {
      await exec("hdiutil", [
        "attach",
        "-readonly",
        "-nobrowse",
        "-noautoopen",
        "-mountpoint",
        extraction,
        archive,
      ]);
      mounted = true;
      app = path.join(extraction, "minddy.app");
    }
    await stat(app);
    await verifyMacApp(app, `${path.basename(archive)}: minddy.app`);
  } finally {
    if (mounted) await exec("hdiutil", ["detach", extraction]).catch(() => undefined);
    await rm(extraction, { recursive: true, force: true });
  }
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

// Refusal 1 — the app must be valid on disk, not merely display a signature.
// `codesign -dv` only prints metadata and can succeed for a bundle whose nested
// helpers or sealed resources have been modified.
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
    await verifyMacApp(app, path.relative(repo, app));
  } catch (error) {
    fail(`${error.message} See docs/desktop-release.md.`);
  }
}

// Refusal 2 — the `app-update.yml` of the bundle bears the URL of the flow. This is the
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

// Refusal 3 — verify the checksums and sizes generated by electron-builder before
// publishing any archive. This catches truncation or replacement in the build
// directory before the same bytes become the public download.
const manifest = await readFile(path.join(RELEASE_DIR, "latest-mac.yml"), "utf8");
let artifacts;
try {
  artifacts = requireMacReleaseArtifacts(manifest, entries);
} catch (error) {
  fail(error.message);
}

for (const artifact of artifacts) {
  const archive = path.join(RELEASE_DIR, artifact.name);
  const body = await readFile(archive);
  const digest = createHash("sha512").update(body).digest("base64");
  if (body.length !== artifact.size || digest !== artifact.sha512) {
    fail(
      `${artifact.name} does not match latest-mac.yml: expected ${artifact.size} bytes and ` +
        `sha512 ${artifact.sha512}.`
    );
  }
  try {
    await verifyMacArchive(archive);
  } catch (error) {
    fail(error.message);
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
const referenced = artifacts.map(({ name }) => name);

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
