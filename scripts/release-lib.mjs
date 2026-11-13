import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid SemVer version: ${version}`);
  }
  return version;
}

// Oldest official Supabase Docker release whose image set clears the Storage
// advisories GHSA-67rp-h2mf-ph72, GHSA-8rrf-w776-x75g and GHSA-fgvp-cqg6-q8h2
// (RLS bypass with a signed `role: "none"` token, fixed in 1.89.9) and the
// Realtime advisories GHSA-hg9h-6mhq-6c2v (CVE-2026-54238) and
// GHSA-9vjf-j9f7-j42c. GHSA-2rcv-vpjw-5g6c (Realtime before 2.146.0) needs a
// second tenant, which the single-tenant official distribution does not create.
// Rows published before a floor was raised stay unchanged; the next release
// adds a row that reaches it.
/**
 * The iOS app's version for a release: the App Store reads only one to three
 * integers (`CFBundleShortVersionString`), so a pre-release keeps its numbers.
 */
export function appStoreVersion(version) {
  return assertVersion(version).split("-")[0];
}

/** `MARKETING_VERSION` of each build configuration in an Xcode project file. */
export function xcodeMarketingVersions(project) {
  return [...project.matchAll(/MARKETING_VERSION = ([^;]+);/gu)].map((match) => match[1].trim());
}

/** The Xcode project file with every `MARKETING_VERSION` set for `version`. */
export function setXcodeMarketingVersion(project, version) {
  const target = appStoreVersion(version);
  return project.replace(/MARKETING_VERSION = [^;]+;/gu, `MARKETING_VERSION = ${target};`);
}

export const MINIMUM_OFFICIAL_SUPABASE_RELEASE = "self-hosted/v0.8.4";

// First image versions past those advisories' affected ranges; the pinned
// upstream Compose file must reach them.
export const MINIMUM_OFFICIAL_SUPABASE_IMAGES = {
  "supabase/realtime": "2.137.15",
  "supabase/storage-api": "1.89.9",
};

function numericVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? match.slice(1).map(Number) : null;
}

export function isVersionAtLeast(value, minimum) {
  const actual = numericVersion(value);
  const floor = numericVersion(minimum);
  if (!actual || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== floor[index]) return actual[index] > floor[index];
  }
  return true;
}

export function assertOfficialSupabaseRelease(release) {
  const prefix = "self-hosted/";
  const minimum = MINIMUM_OFFICIAL_SUPABASE_RELEASE;
  if (
    typeof release !== "string" ||
    !release.startsWith(prefix) ||
    !isVersionAtLeast(release.slice(prefix.length), minimum.slice(prefix.length))
  ) {
    throw new Error(
      `the complete official Supabase profile must pin ${minimum} or later, not ${release ?? "nothing"}`,
    );
  }
  return release;
}

function imageTags(compose, image) {
  return [...compose.matchAll(/^\s*image:\s*(\S+)\s*$/gm)]
    .map((match) => {
      const reference = match[1];
      const separator = reference.lastIndexOf(":");
      return separator === -1
        ? { name: reference, tag: "" }
        : { name: reference.slice(0, separator), tag: reference.slice(separator + 1) };
    })
    .filter((reference) => reference.name === image)
    .map((reference) => reference.tag);
}

export function assertOfficialSupabaseImages(compose) {
  for (const [image, minimum] of Object.entries(MINIMUM_OFFICIAL_SUPABASE_IMAGES)) {
    const tags = imageTags(compose, image);
    if (tags.length === 0) throw new Error(`the pinned upstream Compose file does not declare ${image}`);
    for (const tag of tags) {
      if (!isVersionAtLeast(tag, minimum)) {
        throw new Error(`the pinned upstream Compose file uses ${image}:${tag}; ${minimum} or later is required`);
      }
    }
  }
}

// First Storage version that bounds the lifetime of signed S3 requests
// (GHSA-2p28-q2vx-mw6w). No official Supabase release ships it yet, so the
// complete profile must keep the Storage S3 protocol off until one does.
export const STORAGE_S3_PROTOCOL_PATCHED = "1.84.14";

function serviceBlock(compose, service) {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `  ${service}:`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

export function assertStorageS3ProtocolMitigation(upstreamCompose, overlayCompose) {
  const tags = imageTags(upstreamCompose, "supabase/storage-api");
  if (tags.length > 0 && tags.every((tag) => isVersionAtLeast(tag, STORAGE_S3_PROTOCOL_PATCHED))) return;
  if (!/^\s+S3_PROTOCOL_ENABLED:\s*["']?false["']?\s*$/m.test(serviceBlock(overlayCompose, "storage"))) {
    throw new Error(
      `the pinned upstream Compose file uses supabase/storage-api:${tags.join(", ") || "unknown"}, ` +
        `below ${STORAGE_S3_PROTOCOL_PATCHED}; compose.full.yml must set S3_PROTOCOL_ENABLED: "false" on storage`,
    );
  }
}

export function assertReleaseCompatibility(compatibility, version) {
  const tag = `v${assertVersion(version)}`;
  if (compatibility?.schemaVersion !== 1 || !Array.isArray(compatibility.entries)) {
    throw new Error("deploy/self-hosted/compatibility.json must use schema version 1 and contain an entries array");
  }

  const matches = compatibility.entries.filter(
    (entry) => entry?.minddyRelease === version || entry?.tag === tag,
  );
  if (matches.length !== 1) {
    throw new Error(
      `deploy/self-hosted/compatibility.json must contain exactly one row for minddy ${version}`,
    );
  }

  const entry = matches[0];
  if (entry.minddyRelease !== version || entry.tag !== tag) {
    throw new Error(`the self-hosted compatibility row must pair ${version} with ${tag}`);
  }

  const expectedImage = `ghcr.io/mangue-dev/minddy:${tag}`;
  if (entry.referenceCompose?.minddyImage !== expectedImage) {
    throw new Error(`the self-hosted compatibility row must reference ${expectedImage}`);
  }

  const requiredTopologies = ["simple-managed-supabase", "complete-official-supabase"];
  for (const topology of requiredTopologies) {
    if (!entry.supportedTopologies?.includes(topology)) {
      throw new Error(`the self-hosted compatibility row must support ${topology}`);
    }
  }

  assertOfficialSupabaseRelease(entry.supabase?.completeOfficial?.release);

  return entry;
}

export async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
