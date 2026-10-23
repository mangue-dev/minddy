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
// advisories GHSA-67rp-h2mf-ph72 and GHSA-8rrf-w776-x75g and the Realtime
// advisories GHSA-hg9h-6mhq-6c2v (CVE-2026-54238) and GHSA-9vjf-j9f7-j42c.
// GHSA-2rcv-vpjw-5g6c (Realtime before 2.146.0) needs a second tenant, which
// the single-tenant official distribution does not create.
export const MINIMUM_OFFICIAL_SUPABASE_RELEASE = "self-hosted/v0.8.3";

// First image versions past those advisories' affected ranges; the pinned
// upstream Compose file must reach them.
export const MINIMUM_OFFICIAL_SUPABASE_IMAGES = {
  "supabase/realtime": "2.137.15",
  "supabase/storage-api": "1.80.2",
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

export function assertOfficialSupabaseImages(compose) {
  for (const [image, minimum] of Object.entries(MINIMUM_OFFICIAL_SUPABASE_IMAGES)) {
    const escaped = image.replace(/[/.]/g, "\\$&");
    const tags = [...compose.matchAll(new RegExp(`^\\s*image:\\s*${escaped}:(\\S+)\\s*$`, "gm"))].map(
      (match) => match[1],
    );
    if (tags.length === 0) throw new Error(`the pinned upstream Compose file does not declare ${image}`);
    for (const tag of tags) {
      if (!isVersionAtLeast(tag, minimum)) {
        throw new Error(`the pinned upstream Compose file uses ${image}:${tag}; ${minimum} or later is required`);
      }
    }
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
