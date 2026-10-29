/**
 * The desktop app's local installer, without Electron (MIN-781).
 *
 * The app can install self-hosted minddy on the person's computer: check the
 * tools the local profile needs, clone the published release, install its
 * dependencies, record the administrator, then hand over to the existing local
 * runtime (`pnpm self-host:local`): Supabase and the build as their own step,
 * then the start. Last, it creates the account the app signs in with
 * (`local-account.ts`). It runs the documented procedure of the `install-locally` article,
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
  "folderIsInstallation",
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
 * empty or absent folder is cloned; a clone this installer made (a previous
 * attempt that stopped after downloading, marked by `MANAGED_INSTALL_MARKER`)
 * resumes without a second download. A minddy clone the person made
 * themselves is theirs: its branch and `ADMIN_EMAILS` are never touched, it
 * is opened with "Use an existing installation". Anything else is somebody's
 * files and is never written into.
 */
export type LocalInstallFolderState = "absent" | "empty" | "minddy" | "installation" | "occupied";

/** Inside the clone's `.git`, so it never shows as a change in the worktree. */
export const MANAGED_INSTALL_MARKER = ".git/minddy-desktop-install";

/**
 * Files whose presence tells what the cloned release can do. The installer
 * clones the newest published release, which may predate the steps added
 * with it (MIN-781): without `--prepare-only` the launcher prepares while it
 * starts; without the auto sign-in page the person signs up on the instance.
 */
export const MANAGED_ACCOUNT_PAGE = "components/auth/desktop-local-sign-in.tsx";

export function launcherSupportsPrepareOnly(launcherSource: string): boolean {
  return launcherSource.includes('"--prepare-only"');
}

export function cloneNeeded(folder: LocalInstallFolderState): boolean {
  return folder === "absent" || folder === "empty";
}

export function folderAcceptable(folder: LocalInstallFolderState): boolean {
  return folder === "absent" || folder === "empty" || folder === "minddy";
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
  return withEnvValue(envText, "ADMIN_EMAILS", email.trim());
}

/** Sets one `KEY=value` line, in place when the key is already there. */
function withEnvValue(envText: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = envText.length > 0 ? envText.replace(/\n$/, "").split("\n") : [];
  const index = lines.findIndex((entry) => new RegExp(`^\\s*${key}\\s*=`).test(entry));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return `${lines.join("\n")}\n`;
}

/**
 * The instance on this computer lets its administrator edit its variables
 * from the admin dashboard (MIN-847): the person installing it owns the
 * computer. A value already in the file — `0` written by hand — is kept.
 */
export function withConfigOverrides(envText: string): string {
  return /^\s*MINDDY_CONFIG_OVERRIDES\s*=\s*\S/m.test(envText)
    ? envText
    : withEnvValue(envText, "MINDDY_CONFIG_OVERRIDES", "1");
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
  // `cmd.exe` still expands `%VAR%` and `!VAR!` and ends a quoted argument at
  // `"`, even inside the quotes below. No fixed argument contains them, so
  // one that does can only be a folder name: refuse it rather than let the
  // shell read it.
  const unsafe = argv.find((argument) => /["%!]/.test(argument));
  if (unsafe !== undefined) throw new Error("This folder name cannot be used on Windows. Choose a folder without \", % or !.");
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
