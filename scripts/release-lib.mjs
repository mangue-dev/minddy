import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid SemVer version: ${version}`);
  }
  return version;
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

  return entry;
}

export async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
