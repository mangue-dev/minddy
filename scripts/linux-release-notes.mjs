import { readFile, writeFile } from "node:fs/promises";

export const LINUX_SIGNING_KEY_HEADING = "## Linux package signing key";
const FINGERPRINT_PATTERN = /^(?:[A-F0-9]{40}|[A-F0-9]{64})$/;

/** Validates the public identifier that is safe to include in release notes. */
export function normalizeLinuxSigningFingerprint(fingerprint) {
  if (typeof fingerprint !== "string" || !FINGERPRINT_PATTERN.test(fingerprint.trim().toUpperCase())) {
    throw new Error("Linux signing fingerprint must be a 40- or 64-character hexadecimal value");
  }
  return fingerprint.trim().toUpperCase();
}

/** Adds or replaces the deterministic Linux signing-key section in a release body. */
export function withLinuxSigningKeyReleaseNotes(releaseNotes, fingerprint) {
  if (typeof releaseNotes !== "string") throw new TypeError("Release notes must be a string");
  const normalizedFingerprint = normalizeLinuxSigningFingerprint(fingerprint);
  const section = `${LINUX_SIGNING_KEY_HEADING}\n\nLinux artifacts are signed with the public key attached to this release as \`minddy-linux-release-key.asc\`. Verify its fingerprint before installing a package:\n\n\`${normalizedFingerprint}\``;
  const sectionPattern = new RegExp(`(?:^|\\n)${LINUX_SIGNING_KEY_HEADING.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  const body = releaseNotes.trimEnd();
  const withoutPreviousSection = body.replace(sectionPattern, "").trimEnd();

  return `${withoutPreviousSection}${withoutPreviousSection ? "\n\n" : ""}${section}\n`;
}

async function main() {
  const [inputPath, outputPath, fingerprint] = process.argv.slice(2);
  if (!inputPath || !outputPath || !fingerprint || process.argv.length !== 5) {
    throw new Error("Usage: node scripts/linux-release-notes.mjs <input-notes> <output-notes> <fingerprint>");
  }
  const releaseNotes = await readFile(inputPath, "utf8");
  await writeFile(outputPath, withLinuxSigningKeyReleaseNotes(releaseNotes, fingerprint));
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
