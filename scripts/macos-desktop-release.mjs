import path from "node:path";

export const MAC_ARTIFACT_PATTERN = /\.(?:dmg|zip)$/;

function quotedValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isSafeReleaseFile(name) {
  return name === path.basename(name) && !name.includes("\0") && !name.includes("\\");
}

/**
 * Reads the archive entries that electron-builder announces in latest-mac.yml.
 * The checksums and sizes are retained so publication can verify the bytes before
 * sending them to the public feed.
 */
export function macArtifactMetadata(manifest, manifestName = "latest-mac.yml") {
  const artifacts = [];
  let current = null;

  const flush = () => {
    if (current) artifacts.push(current);
    current = null;
  };

  for (const line of manifest.split("\n")) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line);
    if (url) {
      flush();
      const name = quotedValue(url[1]);
      if (MAC_ARTIFACT_PATTERN.test(name)) {
        if (!isSafeReleaseFile(name)) {
          throw new Error(`${manifestName} contains an unsafe artifact name: ${name}`);
        }
        current = { name, sha512: null, size: null };
      }
      continue;
    }

    if (!current) continue;
    if (/^\S/.test(line)) {
      flush();
      continue;
    }

    const sha512 = /^\s*sha512:\s*(\S+)\s*$/.exec(line);
    if (sha512) current.sha512 = quotedValue(sha512[1]);

    const size = /^\s*size:\s*(\d+)\s*$/.exec(line);
    if (size) current.size = Number(size[1]);
  }
  flush();

  if (artifacts.length === 0) {
    throw new Error(`${manifestName} does not announce a DMG or ZIP artifact`);
  }
  for (const artifact of artifacts) {
    if (!artifact.sha512 || artifact.size === null) {
      throw new Error(`${manifestName} has incomplete metadata for ${artifact.name}`);
    }
  }
  return artifacts;
}

/** Requires every archive announced by the manifest to exist before publication. */
export function requireMacReleaseArtifacts(manifest, entries, manifestName = "latest-mac.yml") {
  const artifacts = macArtifactMetadata(manifest, manifestName);
  const missing = artifacts.map(({ name }) => name).filter((name) => !entries.includes(name));
  if (missing.length > 0) {
    throw new Error(`${manifestName} announces files missing from desktop/release: ${missing.join(", ")}`);
  }
  return artifacts;
}
