#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  LINUX_PUBLIC_KEY,
  LINUX_UPDATE_MANIFESTS,
  requireLinuxArtifactArchitecture,
  requireLinuxReleaseArtifacts,
  signatureStatusMatchesFingerprint,
} from "./linux-desktop-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "desktop", "release");
const fingerprint = (process.env.MINDDY_LINUX_GPG_FINGERPRINT ?? "").replaceAll(/\s/g, "").toUpperCase();
const passphrase = process.env.MINDDY_LINUX_GPG_PASSPHRASE ?? "";

function fail(message) {
  console.error(`[sign-linux-desktop] ${message}`);
  process.exit(1);
}

function gpg(argumentsList, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("gpg", argumentsList, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `gpg exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}

function signaturePath(file) {
  return `${file}.asc`;
}

async function sign(file) {
  await gpg(
    [
      "--batch",
      "--yes",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
      "--local-user",
      fingerprint,
      "--armor",
      "--detach-sign",
      "--output",
      signaturePath(file),
      file,
    ],
    `${passphrase}\n`
  );
}

async function verify(file) {
  const { stdout } = await gpg(["--batch", "--status-fd", "1", "--verify", signaturePath(file), file]);
  if (!signatureStatusMatchesFingerprint(stdout, fingerprint)) {
    throw new Error(`${path.basename(file)} was not signed by ${fingerprint}`);
  }
}

function checksum(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

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
  fail("desktop/release is missing one or more Linux update manifests — build all Linux targets first.");
}

try {
  for (const release of releaseSets) {
    release.artifacts = requireLinuxReleaseArtifacts(release.content, entries, release.manifest);
    requireLinuxArtifactArchitecture(release.artifacts, release.arch, release.manifest);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const releaseFiles = releaseSets.flatMap((release) => [release.manifest, ...release.artifacts]);
try {
  const exported = await gpg(["--batch", "--armor", "--export", fingerprint]);
  if (!exported.stdout.includes("BEGIN PGP PUBLIC KEY BLOCK")) {
    fail(`no public key is available for ${fingerprint}`);
  }
  await writeFile(path.join(releaseDirectory, LINUX_PUBLIC_KEY), exported.stdout, "utf8");

  for (const file of releaseFiles) {
    const absoluteFile = path.join(releaseDirectory, file);
    await sign(absoluteFile);
    await verify(absoluteFile);
  }

  for (const release of releaseSets) {
    const checksumLines = [];
    const files = [release.manifest, ...release.artifacts];
    for (const file of files) {
      checksumLines.push(`${checksum(await readFile(path.join(releaseDirectory, file)))}  ${file}`);
    }
    const checksumFile = path.join(releaseDirectory, release.checksums);
    await writeFile(checksumFile, `${checksumLines.join("\n")}\n`, "utf8");
    await sign(checksumFile);
    await verify(checksumFile);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(
  `[sign-linux-desktop] signed ${releaseFiles.length} release files and ${releaseSets.length} checksum lists with ${fingerprint}.`
);
