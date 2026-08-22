/**
 * The desktop app update feed, read by SITE (MIN-292).
 *
 * `latest-mac.yml` is the manifest that electron-builder publishes alongside the
 * binaries. In the app, no one reads it by hand: electron-updater loads it from
 * the `app-update.yml` that electron-builder slipped into the bundle (see the
 * `publish` block in desktop/electron-builder.yml).
 *
 * This module is used for the other reader: the public download page. It
 * needs to point to the MOST RECENT `.dmg` without hardcoding a version number
 * in a translated string — otherwise every release requires editing
 * `messages/en.json` and `messages/fr.json`, and the page becomes wrong the day
 * someone forgets.
 *
 * The parser is written by hand and does not pretend to read YAML: it reads THIS
 * file, whose shape is produced by a generator rather than a human.
 * Adding a real YAML parser to the site bundle for six list entries would be
 * a poor trade-off.
 */

/** The two Mac architectures that we publish. */
export type MacArch = "arm64" | "x64";
export type LinuxArch = "arm64" | "x64";
export type LinuxPackageFormat = "AppImage" | "deb" | "rpm";

export const MAC_ARCHES: readonly MacArch[] = ["arm64", "x64"] as const;
export const LINUX_ARCHES: readonly LinuxArch[] = ["x64", "arm64"] as const;

export function isMacArch(value: string | null | undefined): value is MacArch {
  return value === "arm64" || value === "x64";
}

export function isLinuxArch(value: string | null | undefined): value is LinuxArch {
  return value === "arm64" || value === "x64";
}

export function isLinuxPackageFormat(value: string | null | undefined): value is LinuxPackageFormat {
  return value === "AppImage" || value === "deb" || value === "rpm";
}

/** electron-builder names x64's feed without a suffix and appends other architectures. */
export function linuxUpdateManifestForArch(arch: LinuxArch): string {
  return arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml";
}

export interface DesktopRelease {
  version: string;
  /** The stream files, in manifest order. */
  files: ReadonlyArray<{
    name: string;
    arch: MacArch;
    kind: "dmg" | "zip";
    /** Bytes, `null` when the manifest does not say so. */
    size: number | null;
  }>;
}

/** A Linux architecture's feed contains every package format built for that architecture. */
export interface LinuxDesktopRelease {
  version: string;
  files: ReadonlyArray<{
    name: string;
    arch: LinuxArch;
    format: LinuxPackageFormat;
    size: number | null;
  }>;
}

/**
 * The base URL of the stream — the folder that contains `latest-mac.yml` and the
 * binaries, WITHOUT trailing slashes.
 *
 * It lives in the server environment rather than in the code: it is a storage URL
 * (Vercel Blob), it changes if the store changes, and it is only known after the store
 * is created. If it is absent, the download route says so plainly instead of redirecting
 * to nowhere.
 */
export function desktopFeedBaseUrl(): string | null {
  const raw = process.env.MINDDY_DESKTOP_FEED_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * A file's architecture is read from its NAME, which is also what electron-updater
 * does: the manifest does not carry the field. electron-builder adds `-arm64` as soon
 * as more than one architecture is published; everything else is Intel.
 */
function archOf(name: string): MacArch {
  return /(?:^|[-_.])(?:arm64|aarch64)(?:[-_.]|$)/i.test(name) ? "arm64" : "x64";
}

function linuxFormatOf(name: string): LinuxPackageFormat | null {
  if (name.endsWith(".AppImage")) return "AppImage";
  if (name.endsWith(".deb")) return "deb";
  if (name.endsWith(".rpm")) return "rpm";
  return null;
}

/**
 * Reads `latest-mac.yml`. Returns `null` for anything that does not have the expected form —
 * an unreachable or truncated feed should not bring down a public page,
 * just deprive it of its button.
 */
export function parseLatestMacFeed(yml: string): DesktopRelease | null {
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  if (!version) return null;

  /**
   * Read LINE BY LINE, rather than with a multiline regular expression.
   * We tried and abandoned that approach: a `files:` entry extends to the next one,
   * which requires recognizing the end of the list — but JavaScript has no
   * `\Z`, and writing `\Z` would still match the letter “Z”. A cursor that advances
   * line by line says the same thing without the trap.
   */
  const files: Array<DesktopRelease["files"][number]> = [];
  let current: DesktopRelease["files"][number] | null = null;

  const flush = () => {
    if (current && !files.some((file) => file.name === current!.name)) files.push(current);
    current = null;
  };

  for (const line of yml.split("\n")) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line);
    if (url) {
      flush();
      const name = url[1].trim().replace(/^['"]|['"]$/g, "");
      const kind = name.endsWith(".dmg") ? "dmg" : name.endsWith(".zip") ? "zip" : null;
      // `.blockmap` and similar files are skipped without opening an entry, or the
      // `size:` that follow would go to the previous file.
      current = kind ? { name, arch: archOf(name), kind, size: null } : null;
      continue;
    }
    if (!current) continue;
    // An unindented key (`path:`, `releaseDate:`) closes the list.
    if (/^\S/.test(line)) {
      flush();
      continue;
    }
    const size = /^\s*size:\s*(\d+)\s*$/.exec(line);
    // The size is what the download page displays: a value hardcoded in a translated
    // string would become stale with the first release.
    if (size) current.size = Number(size[1]);
  }
  flush();

  return files.length > 0 ? { version, files } : null;
}

/** Parses electron-builder's Linux feed without adding a YAML parser to the site bundle. */
export function parseLatestLinuxFeed(yml: string): LinuxDesktopRelease | null {
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  if (!version) return null;

  const files: Array<LinuxDesktopRelease["files"][number]> = [];
  let current: LinuxDesktopRelease["files"][number] | null = null;
  const flush = () => {
    if (current && !files.some((file) => file.name === current!.name)) files.push(current);
    current = null;
  };

  for (const line of yml.split("\n")) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line);
    if (url) {
      flush();
      const name = url[1].trim().replace(/^['"]|['"]$/g, "");
      const format = linuxFormatOf(name);
      current = format ? { name, arch: archOf(name), format, size: null } : null;
      continue;
    }
    if (!current) continue;
    if (/^\S/.test(line)) {
      flush();
      continue;
    }
    const size = /^\s*size:\s*(\d+)\s*$/.exec(line);
    if (size) current.size = Number(size[1]);
  }
  flush();

  return files.length > 0 ? { version, files } : null;
}

/**
 * The name of the file to be used for an architecture — always `.dmg`: this is
 * the first download, that of a human. The `.zip` of the same stream exists
 * for Squirrel.Mac and has no place in a browser.
 */
export function dmgForArch(release: DesktopRelease, arch: MacArch): string | null {
  return dmgEntry(release, arch)?.name ?? null;
}

/** The `.dmg` of an architecture, with its size — what the page displays. */
export function dmgEntry(
  release: DesktopRelease,
  arch: MacArch
): DesktopRelease["files"][number] | null {
  return release.files.find((file) => file.kind === "dmg" && file.arch === arch) ?? null;
}

/** Finds one published Linux installer for the requested architecture and format. */
export function linuxPackageEntry(
  release: LinuxDesktopRelease,
  format: LinuxPackageFormat,
  arch: LinuxArch
): LinuxDesktopRelease["files"][number] | null {
  return release.files.find((file) => file.format === format && file.arch === arch) ?? null;
}

export function linuxPackageForArch(
  release: LinuxDesktopRelease,
  format: LinuxPackageFormat,
  arch: LinuxArch
): string | null {
  return linuxPackageEntry(release, format, arch)?.name ?? null;
}

/**
 * “119 MB”. In DECIMAL megabytes, as the Finder counts them from Snow
 * Leopard: displaying 113.8 (mebibytes) next to a file that macOS
 * announces as 119.4 would make one doubt the correct file.
 */
export function formatBytes(bytes: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(bytes / 1_000_000)
  )} ${locale.startsWith("fr") ? "Mo" : "MB"}`;
}
