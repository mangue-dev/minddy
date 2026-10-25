/**
 * The tools the desktop installer installs by itself (MIN-781).
 *
 * The local profile needs Git, Node.js 24, pnpm, Supabase CLI and a running
 * Docker. Asking the person to download five tools defeats an installer, so
 * the app installs what is missing:
 *
 * - **Without admin rights, in an app-owned folder** (`userData/toolchain`):
 *   Node.js from its official archive, checked against `SHASUMS256.txt`;
 *   pnpm and Supabase CLI from npm, whose lockless install still checks each
 *   package's registry integrity; on Windows, Git as the portable MinGit,
 *   checked against the release digest. Nothing outside that folder changes,
 *   and the folder is put first on PATH only for minddy's own processes.
 * - **Through the system's own consent**: Git on macOS comes from Apple's
 *   command line tools dialog; Docker Desktop on macOS and Windows is
 *   downloaded, its code signature checked, then installed and opened so its
 *   own license and permission prompts run; on Linux, one `pkexec` prompt
 *   installs Git and Docker Engine with the distribution's tools.
 *
 * Everything here is pure; `desktop/src/local-toolchain.ts` runs it.
 */

import type { LocalPrerequisiteResult } from "./local-installer";
import { posixQuote } from "./local-runtime-platform";

export { posixQuote };

/** pnpm as pinned by the repository's `packageManager` field. */
export const MANAGED_PNPM_VERSION = "10.28.0";
/** Supabase CLI as pinned by the release workflow (`SUPABASE_CLI_VERSION`). */
export const MANAGED_SUPABASE_CLI_VERSION = "2.115.0";
/** The Developer ID team that signs Docker Desktop for macOS. */
export const DOCKER_TEAM_ID = "9BNSXJN65R";

export const NODE_SHASUMS_URL = "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt";
export const MINGIT_RELEASE_API = "https://api.github.com/repos/git-for-windows/git/releases/latest";
export const DOCKER_LINUX_SCRIPT_URL = "https://get.docker.com";

/** What the installer does about each tool before the minddy steps. */
export type ToolchainAction =
  | "git"
  | "node"
  | "pnpm"
  | "supabase"
  | "docker"
  | "docker-start";

export const TOOLCHAIN_ACTIONS: readonly ToolchainAction[] = [
  "git",
  "node",
  "pnpm",
  "supabase",
  "docker",
  "docker-start",
];

/**
 * The installation plan, in dependency order: Node.js before the npm-installed
 * pnpm and Supabase CLI, Docker last because its own prompts can keep the
 * person busy while nothing else waits on them.
 */
export function toolchainPlan(results: readonly LocalPrerequisiteResult[]): ToolchainAction[] {
  const state = (id: LocalPrerequisiteResult["id"]) =>
    results.find((result) => result.id === id)?.state ?? "missing";
  const plan: ToolchainAction[] = [];
  if (state("git") !== "ready") plan.push("git");
  if (state("node") !== "ready") plan.push("node");
  if (state("pnpm") !== "ready") plan.push("pnpm");
  if (state("supabase") !== "ready") plan.push("supabase");
  const docker = state("docker");
  if (docker === "stopped") plan.push("docker-start");
  else if (docker !== "ready") plan.push("docker");
  return plan;
}

type Arch = "x64" | "arm64";

export function toolchainArch(arch: string): Arch {
  return arch === "arm64" ? "arm64" : "x64";
}

/** The Node.js archive for this computer, as `SHASUMS256.txt` names it. */
export function nodeArchivePattern(platform: NodeJS.Platform, arch: Arch): RegExp {
  const os = platform === "win32" ? "win" : platform === "darwin" ? "darwin" : "linux";
  const extension = platform === "win32" ? "zip" : "tar\\.gz";
  return new RegExp(`^node-v(24\\.\\d+\\.\\d+)-${os}-${arch}\\.${extension}$`);
}

/** The newest 24.x archive and its SHA-256, from the official checksum list. */
export function nodeArchiveFromShasums(
  shasums: string,
  platform: NodeJS.Platform,
  arch: Arch,
): { file: string; version: string; sha256: string } | null {
  const pattern = nodeArchivePattern(platform, arch);
  for (const line of shasums.split("\n")) {
    const [sha256, file] = line.trim().split(/\s+/);
    const match = file?.match(pattern);
    if (match && /^[0-9a-f]{64}$/.test(sha256)) return { file, version: match[1], sha256 };
  }
  return null;
}

export function nodeArchiveUrl(file: string): string {
  return `https://nodejs.org/dist/latest-v24.x/${file}`;
}

/** The portable MinGit of the latest Git for Windows release, with its digest. */
export function minGitAsset(
  release: unknown,
  arch: Arch,
): { url: string; sha256: string } | null {
  const assets = (release as { assets?: unknown })?.assets;
  if (!Array.isArray(assets)) return null;
  const pattern = arch === "arm64" ? /^MinGit-[\d.]+-arm64\.zip$/ : /^MinGit-[\d.]+-64-bit\.zip$/;
  for (const asset of assets as Array<Record<string, unknown>>) {
    const name = typeof asset.name === "string" ? asset.name : "";
    const digest = typeof asset.digest === "string" ? asset.digest.match(/^sha256:([0-9a-f]{64})$/) : null;
    const url = asset.browser_download_url;
    if (pattern.test(name) && digest && typeof url === "string" && url.startsWith("https://github.com/")) {
      return { url, sha256: digest[1] };
    }
  }
  return null;
}

export function dockerDesktopUrl(platform: NodeJS.Platform, arch: Arch): string | null {
  const cpu = arch === "arm64" ? "arm64" : "amd64";
  if (platform === "darwin") return `https://desktop.docker.com/mac/main/${cpu}/Docker.dmg`;
  if (platform === "win32") return `https://desktop.docker.com/win/main/${cpu}/Docker%20Desktop%20Installer.exe`;
  return null;
}

/** `codesign -dv` reports the signing team on stderr. */
export function signedByDocker(codesignOutput: string): boolean {
  return codesignOutput.split("\n").some((line) => line.trim() === `TeamIdentifier=${DOCKER_TEAM_ID}`);
}

/**
 * Where the managed tools live inside `userData/toolchain`, and the system
 * folders Docker Desktop puts its CLI in. Each entry goes first on PATH when
 * it exists, so a managed Node.js 24 wins over an older system one.
 */
export function toolchainPathEntries(
  platform: NodeJS.Platform,
  root: string,
  home: string,
): string[] {
  const join = (...parts: string[]) => parts.join(platform === "win32" ? "\\" : "/");
  if (platform === "win32") {
    return [
      join(root, "node"),
      join(root, "pnpm"),
      join(root, "supabase", "node_modules", ".bin"),
      join(root, "git", "cmd"),
      "C:\\Program Files\\Docker\\Docker\\resources\\bin",
    ];
  }
  return [
    join(root, "node", "bin"),
    join(root, "pnpm", "bin"),
    join(root, "supabase", "node_modules", ".bin"),
    ...(platform === "darwin"
      ? ["/Applications/Docker.app/Contents/Resources/bin", join(home, ".docker", "bin")]
      : []),
  ];
}


/**
 * The one script `pkexec` runs on Linux: Git from the distribution's package
 * manager, Docker Engine from Docker's own script, the service started, and
 * the person added to the `docker` group (effective at the next sign-in).
 */
export function linuxPrivilegedScript(options: {
  git: boolean;
  docker: boolean;
  startDocker: boolean;
  user: string;
  dockerScript: string;
}): string {
  const lines = ["set -e"];
  if (options.git) {
    lines.push(
      "if command -v apt-get >/dev/null 2>&1; then apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y git",
      "elif command -v dnf >/dev/null 2>&1; then dnf install -y git",
      "elif command -v zypper >/dev/null 2>&1; then zypper --non-interactive install git",
      "elif command -v pacman >/dev/null 2>&1; then pacman -S --noconfirm --needed git",
      'else echo "No supported package manager was found to install Git." >&2; exit 1',
      "fi",
    );
  }
  if (options.docker) lines.push(`sh ${posixQuote(options.dockerScript)}`);
  if (options.docker || options.startDocker) lines.push("systemctl enable --now docker");
  if (options.docker) lines.push(`usermod -aG docker ${posixQuote(options.user)}`);
  return `${lines.join("\n")}\n`;
}

/** A download's progress as a whole percentage, or null without a known size. */
export function downloadPercent(received: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.floor((received / total) * 100));
}
