#!/usr/bin/env node

/**
 * Downloads the official `mcp-publisher` CLI, checksum-pinned, and prints the
 * path of the extracted binary.
 *
 * Used by `.github/workflows/publish-mcp-registry.yml` to publish the server
 * manifest to the official registry after each release. The version and the
 * sha256 checksums are pinned here on purpose: an unpinned release download
 * would let upstream swap the binary that publishes under minddy's name.
 * Upgrading = change the version and every checksum below, taken from
 * `registry_<version>_checksums.txt` in the `modelcontextprotocol/registry`
 * release assets.
 *
 * Usage: node scripts/fetch-mcp-publisher.mjs <target-directory>
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pinned `mcp-publisher` release of the modelcontextprotocol/registry repository. */
export const MCP_PUBLISHER_VERSION = "1.8.1";

/** sha256 of `mcp-publisher_<os>_<arch>.tar.gz`, per released platform. */
const MCP_PUBLISHER_CHECKSUMS = {
  "darwin_amd64": "88126981225e7714fcc6b7a10cdba4a80ae5901e9740a8c06d0d5195c8bc294c",
  "darwin_arm64": "e45e520892460732a4bdf37255576415d4a53ec171f8b913faf15bb1aef7cb77",
  "linux_amd64": "a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc",
  "linux_arm64": "8dd75a6cf6845688b5d4e46df58d3ca26d5c8d233bb0626606e1db82c5e883e4",
  "windows_amd64": "399ad0d6e00a50812b563a71d8bfbff5160c085e6b13aac6ec083d98d5ff7c45",
  "windows_arm64": "2e3a3435e27afcaa35bec9cb573bab99db9e980d7fb49f90f32a59d03d4a3fa3",
};

const REPOSITORY = "modelcontextprotocol/registry";
const ARCHIVE = "mcp-publisher.tar.gz";
const BINARY = "mcp-publisher";

/**
 * The Windows archive ships `mcp-publisher.exe`, the other platforms ship
 * `mcp-publisher` (see the upstream quickstart), so the extracted name is
 * resolved per platform key.
 */
export function binaryName(key) {
  return key.startsWith("windows_") ? `${BINARY}.exe` : BINARY;
}

export function platformKey({ platform, arch } = process) {
  const os = platform === "win32" ? "windows" : platform;
  const cpu = arch === "x64" ? "amd64" : arch;
  const key = `${os}_${cpu}`;
  if (!(key in MCP_PUBLISHER_CHECKSUMS)) {
    throw new Error(`No checksum pinned for platform ${key}.`);
  }
  return key;
}

/** Checks a downloaded archive against the pinned checksum of its platform. */
export function verifyChecksum(body, key) {
  const digest = createHash("sha256").update(body).digest("hex");
  const expected = MCP_PUBLISHER_CHECKSUMS[key];
  if (digest !== expected) {
    throw new Error(
      `Checksum mismatch for ${REPOSITORY} v${MCP_PUBLISHER_VERSION}: ` +
        `expected ${expected}, got ${digest}. Refusing to extract.`,
    );
  }
}

async function downloadArchive(url, key, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download of ${url} failed with status ${response.status}.`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  verifyChecksum(body, key);
  await writeFile(destination, body);
  return destination;
}

async function extractBinary(archive, directory, key) {
  execFileSync("tar", ["xzf", archive, "-C", directory], { stdio: "pipe" });
  const name = binaryName(key);
  const binary = path.join(directory, name);
  if (await stat(binary).then(() => true, () => false)) return binary;
  throw new Error(`Could not locate ${name} after extracting ${archive}.`);
}

export async function fetchMcpPublisher(targetDirectory = ".") {
  const key = platformKey();
  const url =
    `https://github.com/${REPOSITORY}/releases/download/v${MCP_PUBLISHER_VERSION}/` +
    `mcp-publisher_${key}.tar.gz`;
  const directory = path.resolve(targetDirectory);
  const archive = path.join(directory, ARCHIVE);
  await mkdir(directory, { recursive: true });
  try {
    await downloadArchive(url, key, archive);
    const binary = await extractBinary(archive, directory, key);
    if (!key.startsWith("windows_")) await chmod(binary, 0o755);
    return binary;
  } finally {
    await rm(archive, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/fetch-mcp-publisher.mjs <target-directory>");
    process.exitCode = 1;
  } else {
    try {
      const binary = await fetchMcpPublisher(target);
      console.log(binary);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
