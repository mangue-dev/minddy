import path from "node:path";

export const LINUX_PUBLIC_KEY = "minddy-linux-release-key.asc";
export const LINUX_ARTIFACT_PATTERN = /\.(?:AppImage|deb|rpm)$/;

/**
 * electron-builder gives Linux architectures separate update manifests. Keeping
 * each manifest and checksum list separate makes an accidental cross-architecture
 * publication fail before anything reaches the public feed.
 */
export const LINUX_UPDATE_MANIFESTS = Object.freeze([
  { arch: "x64", manifest: "latest-linux.yml", checksums: "SHA256SUMS-linux-x64" },
  { arch: "arm64", manifest: "latest-linux-arm64.yml", checksums: "SHA256SUMS-linux-arm64" },
]);

function quotedValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isSafeReleaseFile(name) {
  return name === path.basename(name) && !name.includes("\0") && !name.includes("\\");
}

/**
 * Reads the files selected by electron-builder's Linux update manifest.
 *
 * The manifest can include metadata for a target that is not a downloadable
 * Linux package. Only the three public package formats are allowed to enter
 * the signing and publication set.
 */
export function linuxArtifactNames(manifest, manifestName = "latest-linux.yml") {
  const files = [];
  for (const match of manifest.matchAll(/^\s*-\s*url:\s*(.+)$/gm)) {
    const name = quotedValue(match[1]);
    if (!LINUX_ARTIFACT_PATTERN.test(name)) continue;
    if (!isSafeReleaseFile(name)) {
      throw new Error(`${manifestName} contains an unsafe artifact name: ${name}`);
    }
    if (!files.includes(name)) files.push(name);
  }
  if (files.length === 0) {
    throw new Error(`${manifestName} does not announce an AppImage, DEB, or RPM artifact`);
  }
  return files;
}

/** Requires the manifest to be complete before a signature can make it public. */
export function requireLinuxReleaseArtifacts(manifest, entries, manifestName = "latest-linux.yml") {
  const files = linuxArtifactNames(manifest, manifestName);
  const missing = files.filter((file) => !entries.includes(file));
  if (missing.length > 0) {
    throw new Error(`${manifestName} announces files missing from desktop/release: ${missing.join(", ")}`);
  }
  return files;
}

/** Rejects an artifact that was placed in the wrong architecture's manifest. */
export function requireLinuxArtifactArchitecture(files, arch, manifestName) {
  const arm64Pattern = /(?:^|[-_.])(?:arm64|aarch64)(?:[-_.]|$)/i;
  const mismatched = files.filter((file) => (arch === "arm64") !== arm64Pattern.test(file));
  if (mismatched.length > 0) {
    throw new Error(`${manifestName} contains ${arch === "arm64" ? "non-ARM64" : "ARM64"} artifacts: ${mismatched.join(", ")}`);
  }
  return files;
}

/** Accepts the configured primary key or an explicitly configured signing subkey. */
export function signatureStatusMatchesFingerprint(status, fingerprint) {
  return status.split("\n").some((line) => {
    const fields = line.trim().split(/\s+/);
    return fields[0] === "[GNUPG:]" && fields[1] === "VALIDSIG" && (fields[2] === fingerprint || fields.at(-1) === fingerprint);
  });
}
