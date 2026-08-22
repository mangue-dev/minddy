#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

import {
  LINUX_PUBLIC_KEY,
  LINUX_UPDATE_MANIFESTS,
  requireLinuxArtifactArchitecture,
  requireLinuxReleaseArtifacts,
  signatureStatusMatchesFingerprint,
} from "./linux-desktop-release.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "desktop", "release");
const feedUrl = process.env.MINDDY_DESKTOP_FEED_URL?.trim();
const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const fingerprint = (process.env.MINDDY_LINUX_GPG_FINGERPRINT ?? "").replaceAll(/\s/g, "").toUpperCase();
const verifyOnly = process.argv.includes("--verify-only");

function fail(message) {
  console.error(`[publish-linux-desktop] ${message}`);
  process.exit(1);
}

async function verifySignature(file) {
  const signature = `${file}.asc`;
  const { stdout } = await run("gpg", ["--batch", "--status-fd", "1", "--verify", signature, file]);
  if (!signatureStatusMatchesFingerprint(stdout, fingerprint)) {
    throw new Error(`${path.basename(file)} was not signed by ${fingerprint}`);
  }
}

if (!feedUrl) fail("MINDDY_DESKTOP_FEED_URL is missing.");
if (!verifyOnly && !token) fail("BLOB_READ_WRITE_TOKEN is missing — nothing to publish without a store.");
if (!/^[0-9A-F]{40}(?:[0-9A-F]{24})?$/.test(fingerprint)) {
  fail("MINDDY_LINUX_GPG_FINGERPRINT must be a 40- or 64-character hexadecimal fingerprint.");
}

let entries;
let releaseSets;
try {
  entries = await readdir(releaseDirectory);
  releaseSets = await Promise.all(
    LINUX_UPDATE_MANIFESTS.map(async (release) => ({
      ...release,
      content: await readFile(path.join(releaseDirectory, release.manifest), "utf8"),
    }))
  );
} catch {
  fail("desktop/release is missing one or more Linux update manifests — build and sign all Linux targets first.");
}

try {
  for (const release of releaseSets) {
    release.artifacts = requireLinuxReleaseArtifacts(release.content, entries, release.manifest);
    requireLinuxArtifactArchitecture(release.artifacts, release.arch, release.manifest);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const signedFiles = releaseSets.flatMap((release) => [
  release.manifest,
  ...release.artifacts,
  release.checksums,
]);
const missing = [
  ...signedFiles,
  ...signedFiles.map((file) => `${file}.asc`),
  LINUX_PUBLIC_KEY,
].filter((file) => !entries.includes(file));
if (missing.length > 0) {
  fail(`Linux signatures or verification material are missing: ${missing.join(", ")}`);
}

try {
  for (const file of signedFiles) await verifySignature(path.join(releaseDirectory, file));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const files = [
  ...releaseSets.flatMap((release) => release.artifacts),
  ...releaseSets.flatMap((release) => release.artifacts.map((file) => `${file}.asc`)),
  ...releaseSets.flatMap((release) => [release.checksums, `${release.checksums}.asc`]),
  LINUX_PUBLIC_KEY,
  ...releaseSets.map((release) => `${release.manifest}.asc`),
  ...releaseSets.map((release) => release.manifest),
];

if (verifyOnly) {
  console.log(`[publish-linux-desktop] verification only: ${files.length} files ready (${files.join(", ")}).`);
  process.exit(0);
}

for (const file of files) {
  const body = await readFile(path.join(releaseDirectory, file));
  const { url } = await put(`desktop/${file}`, body, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: file.startsWith("latest-linux") || file.startsWith("SHA256SUMS-linux") ? 60 : 31_536_000,
  });
  console.log(`[publish-linux-desktop] ${file} → ${url}`);
}

console.log(
  `[publish-linux-desktop] ${releaseSets.reduce((count, release) => count + release.artifacts.length, 0)} Linux packages published with GPG verification.`
);
