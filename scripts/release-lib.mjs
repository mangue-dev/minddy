import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`version SemVer invalide : ${version}`);
  }
  return version;
}

export function changelogSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = changelog.match(
    new RegExp(`^## \\[${escaped}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, "m"),
  );
  if (!match) throw new Error(`CHANGELOG.md ne contient pas de section [${version}]`);
  const body = match[1].trim();
  if (!body) throw new Error(`la section [${version}] du changelog est vide`);
  return body;
}

export function unreleasedSection(changelog) {
  const match = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[)/m);
  if (!match || !match[1].trim()) {
    throw new Error("la section [Unreleased] du changelog est vide");
  }
  return match[1].trim();
}

export async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export function updateChangelog(changelog, version, date) {
  assertVersion(version);
  const pending = unreleasedSection(changelog);
  const released = `## [Unreleased]\n\n## [${version}] - ${date}\n\n${pending}\n`;
  const next = changelog.replace(
    /^## \[Unreleased\]\n[\s\S]*?(?=^## \[)/m,
    `${released}\n`,
  );
  return next
    .replace(
      /^\[Unreleased\]:.*$/m,
      `[Unreleased]: https://github.com/mangue-dev/minddy-issues/compare/v${version}...HEAD`,
    )
    .concat(`\n[${version}]: https://github.com/mangue-dev/minddy-issues/releases/tag/v${version}\n`);
}
