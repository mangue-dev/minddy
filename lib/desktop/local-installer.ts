/**
 * The desktop app's local installer, without Electron (MIN-781).
 *
 * The app can install self-hosted minddy on the person's computer: check the
 * tools the local profile needs, clone the published release, install its
 * dependencies, record the administrator, then hand over to the existing local
 * runtime (`pnpm self-host:local`), which prepares Supabase, builds and starts
 * the app, and creates the account the app signs in with (`local-account.ts`). It runs the documented procedure of the `install-locally` article,
 * not a second one: the same tools, the same release, the same launcher.
 *
 * Everything here is pure so it can be tested; `desktop/src/local-installer.ts`
 * runs it.
 */

import type { ToolchainAction } from "./local-toolchain";

export const MINDDY_REPOSITORY_GIT_URL = "https://github.com/mangue-dev/minddy.git";

/** The tools of the local profile, in the order the window lists them. */
export const LOCAL_PREREQUISITES = ["git", "node", "pnpm", "supabase", "docker"] as const;
export type LocalPrerequisiteId = (typeof LOCAL_PREREQUISITES)[number];

export type LocalPrerequisiteState = "ready" | "missing" | "outdated" | "stopped";

export interface LocalPrerequisiteResult {
  id: LocalPrerequisiteId;
  state: LocalPrerequisiteState;
  /** The version found, when the tool answered. */
  version?: string;
}

/** A command's outcome, as the runner reports it. */
export interface ProbeOutput {
  ok: boolean;
  stdout: string;
}

/** What each tool is called and where to get it. Product names stay untranslated. */
export const LOCAL_PREREQUISITE_INFO: Record<
  LocalPrerequisiteId,
  { name: string; url: string; probe: string[] }
> = {
  git: { name: "Git", url: "https://git-scm.com/downloads", probe: ["git", "--version"] },
  node: { name: "Node.js 24", url: "https://nodejs.org/en/download", probe: ["node", "--version"] },
  pnpm: { name: "pnpm", url: "https://pnpm.io/installation", probe: ["pnpm", "--version"] },
  supabase: {
    name: "Supabase CLI",
    url: "https://supabase.com/docs/guides/local-development/cli/getting-started",
    probe: ["supabase", "--version"],
  },
  docker: {
    name: "Docker",
    url: "https://www.docker.com/products/docker-desktop/",
    probe: ["docker", "--version"],
  },
};

/** `docker info` answers only when the daemon runs, which `--version` cannot tell. */
export const DOCKER_DAEMON_PROBE = ["docker", "info", "--format", "{{.ServerVersion}}"];

const MINIMUM_NODE = [24, 22, 1] as const;

function firstVersion(text: string): string | undefined {
  return text.match(/\d+\.\d+(?:\.\d+)?/)?.[0];
}

/** Node.js 24.22.1 or a later 24.x: the release the local profile is tested on. */
export function nodeVersionSupported(version: string): boolean {
  const [major, minor = 0, patch = 0] = version.split(".").map(Number);
  if (major !== MINIMUM_NODE[0]) return false;
  if (minor !== MINIMUM_NODE[1]) return minor > MINIMUM_NODE[1];
  return patch >= MINIMUM_NODE[2];
}

/**
 * Reads one tool's probe. Docker needs both answers: an installed client with a
 * stopped daemon is the most common failure, and it has its own remedy.
 */
export function evaluatePrerequisite(
  id: LocalPrerequisiteId,
  probe: ProbeOutput,
  daemon?: ProbeOutput,
): LocalPrerequisiteResult {
  if (!probe.ok) return { id, state: "missing" };
  const version = firstVersion(probe.stdout);
  if (id === "node" && (!version || !nodeVersionSupported(version))) {
    return { id, state: "outdated", version };
  }
  if (id === "docker" && !daemon?.ok) return { id, state: "stopped", version };
  return { id, state: "ready", version };
}

export function prerequisitesReady(results: readonly LocalPrerequisiteResult[]): boolean {
  return (
    LOCAL_PREREQUISITES.every((id) => results.some((result) => result.id === id)) &&
    results.every((result) => result.state === "ready")
  );
}

/** The minddy steps, in the order they run after any tool installation. */
export const LOCAL_INSTALL_STEPS = ["clone", "dependencies", "configure", "prepare", "start", "account"] as const;
/** A tool installation (`local-toolchain.ts`) or a minddy step. */
export type LocalInstallStep = ToolchainAction | (typeof LOCAL_INSTALL_STEPS)[number];
export type LocalInstallStepState = "pending" | "running" | "done" | "skipped" | "failed";

/**
 * What the installer says, as a catalog key (`DesktopWelcome` namespace) the
 * page translates, or as a raw line a command printed. The main process never
 * carries localized copy: the page that shows it owns its language.
 */
export const INSTALL_MESSAGE_CODES = [
  "downloadProgress",
  "verifyFailed",
  "gitWaiting",
  "dockerInstallerOpen",
  "dockerWaiting",
  "dockerTimeout",
  "systemPasswordPrompt",
  "linuxManual",
  "linuxSessionRestart",
  "toolStillMissing",
  "installCanceled",
  "folderNotEmpty",
  "folderRequired",
  "folderInvalid",
  "serverInvalid",
  "localStartFailed",
  "installBusy",
] as const;
export type InstallMessageCode = (typeof INSTALL_MESSAGE_CODES)[number];
export type InstallMessage =
  | { code: InstallMessageCode; values?: Record<string, string> }
  | { text: string };

export function installMessage(code: InstallMessageCode, values?: Record<string, string>): InstallMessage {
  return values ? { code, values } : { code };
}

export interface LocalInstallProgress {
  step: LocalInstallStep;
  state: LocalInstallStepState;
  /** What the step is waiting for, or the last line its command printed. */
  detail?: InstallMessage;
}

/**
 * What the chosen folder already holds decides where the install starts. An
 * empty or absent folder is cloned; a minddy clone (a previous attempt that
 * stopped after downloading) resumes without a second download; anything
 * else is somebody's files and is never written into.
 */
export type LocalInstallFolderState = "absent" | "empty" | "minddy" | "occupied";

export function cloneNeeded(folder: LocalInstallFolderState): boolean {
  return folder === "absent" || folder === "empty";
}

export function folderAcceptable(folder: LocalInstallFolderState): boolean {
  return folder !== "occupied";
}

export function cloneArguments(tag: string, folder: string): string[] {
  return [
    "git",
    "clone",
    "--depth",
    "1",
    "--branch",
    tag,
    "--config",
    "advice.detachedHead=false",
    MINDDY_REPOSITORY_GIT_URL,
    folder,
  ];
}

export const DEPENDENCIES_ARGUMENTS = ["pnpm", "install", "--frozen-lockfile"];

/**
 * Supabase and the production build, as their own step: a first installation
 * pulls the Supabase images and builds the app, which can outlast the local
 * runtime's readiness deadline. The launcher's `--prepare-only` runs exactly
 * that phase and exits; the runtime then starts in seconds.
 */
export const PREPARE_ARGUMENTS = ["pnpm", "self-host:local", "--", "--no-open", "--prepare-only"];

/**
 * Sets `ADMIN_EMAILS` in `.env.local`, which the local launcher completes but
 * never overwrites. A previous value is replaced: this installation's owner is
 * the account the app manages (`local-account.ts`).
 */
export function withAdminEmail(envText: string, email: string): string {
  const line = `ADMIN_EMAILS=${email.trim()}`;
  const lines = envText.length > 0 ? envText.replace(/\n$/, "").split("\n") : [];
  const index = lines.findIndex((entry) => /^\s*ADMIN_EMAILS\s*=/.test(entry));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return `${lines.join("\n")}\n`;
}

/**
 * How a desktop app sees the person's tools.
 *
 * An app started from the Dock or a launcher does not inherit the terminal's
 * PATH: Homebrew, nvm or the Supabase CLI are invisible to it. The existing
 * local runtime solves this by going through the login shell; the installer
 * asks that shell for its PATH once and then runs each tool directly, without
 * a shell, so no folder name is ever parsed as a command.
 */
export function loginShellPathProbe(
  platform: NodeJS.Platform,
  configuredShell?: string,
): { command: string; args: string[] } | null {
  if (platform === "win32") return null;
  const shell = configuredShell || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  return { command: shell, args: ["-lc", 'printf "%s" "$PATH"'] };
}

/**
 * Windows starts `pnpm`, `supabase` and Corepack shims through `cmd.exe`,
 * which needs the arguments quoted. POSIX runs the executable directly.
 */
export function installerCommand(
  platform: NodeJS.Platform,
  argv: readonly string[],
): { command: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (platform !== "win32") return { command: argv[0], args: argv.slice(1) };
  const line = argv.map(quoteWindowsArgument).join(" ");
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    windowsVerbatimArguments: true,
  };
}

function quoteWindowsArgument(argument: string): string {
  if (/^[\w./:=@{}\\-]+$/.test(argument)) return argument;
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

/** The last meaningful line of a command's output, for the progress list. */
export function lastOutputLine(output: string, max = 160): string | undefined {
  const line = output
    .split(/\r?\n|\r/)
    // eslint-disable-next-line no-control-regex -- Strips the ESC colour sequences tools print.
    .map((entry) => entry.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return undefined;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
