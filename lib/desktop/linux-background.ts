import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const LINUX_BACKGROUND_ARGUMENT = "--background";
export const LINUX_BACKGROUND_AUTOSTART_FILE = "minddy-background.desktop";
const LINUX_BACKGROUND_PREFERENCE_FILE = "linux-background-notifications.json";

export interface LinuxBackgroundEnvironment {
  APPIMAGE?: string;
  XDG_CONFIG_HOME?: string;
}

export interface LinuxBackgroundNotificationState {
  readonly enabled: boolean;
  readonly autostartInstalled: boolean;
  readonly nativeBannersAvailable: boolean;
}

/** Recognize the exact autostart argument without accepting similarly named flags. */
export function isLinuxBackgroundLaunch(argv: readonly string[]): boolean {
  return argv.includes(LINUX_BACKGROUND_ARGUMENT);
}

function xdgConfigHome(environment: LinuxBackgroundEnvironment, home: string): string {
  const configured = environment.XDG_CONFIG_HOME?.trim();
  return configured && path.isAbsolute(configured)
    ? configured
    : path.join(home, ".config");
}

/** The per-user XDG entry is separate from the package-installed launcher. */
export function linuxBackgroundAutostartPath(
  environment: LinuxBackgroundEnvironment,
  home: string
): string {
  return path.join(
    xdgConfigHome(environment, home),
    "autostart",
    LINUX_BACKGROUND_AUTOSTART_FILE
  );
}

/** AppImage updates and moves must keep pointing at the outer portable file. */
export function linuxBackgroundExecutable(
  environment: LinuxBackgroundEnvironment,
  execPath: string
): string {
  const appImage = environment.APPIMAGE?.trim();
  return appImage && path.isAbsolute(appImage) ? appImage : execPath;
}

/**
 * Quote one Desktop Entry Exec argument according to the freedesktop grammar.
 * Newlines and NUL cannot be represented safely and are rejected.
 */
export function escapeDesktopEntryExecArgument(value: string): string {
  if (value.includes("\0") || /[\r\n]/u.test(value)) {
    throw new Error("Desktop Entry arguments cannot contain control characters.");
  }
  const escaped = value
    .replace(/%/gu, "%%")
    .replace(/[\\`"$]/gu, "\\$&");
  return `"${escaped}"`;
}

/** Build the complete deterministic XDG autostart entry. */
export function linuxBackgroundDesktopEntry(executable: string): string {
  const exec = [executable, LINUX_BACKGROUND_ARGUMENT]
    .map(escapeDesktopEntryExecArgument)
    .join(" ");
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=minddy",
    "Comment=Keep minddy notifications available in the background",
    `Exec=${exec}`,
    "Terminal=false",
    "NoDisplay=true",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

export function linuxBackgroundPreferencePath(userData: string): string {
  return path.join(userData, LINUX_BACKGROUND_PREFERENCE_FILE);
}

/** Read a deliberately tiny preference file and fail closed if it is damaged. */
export function readLinuxBackgroundPreference(userData: string): boolean {
  try {
    const value = JSON.parse(
      readFileSync(linuxBackgroundPreferencePath(userData), "utf8")
    ) as unknown;
    return !!value && typeof value === "object" &&
      (value as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

/** Persist consent before synchronizing the replaceable XDG launcher. */
export function writeLinuxBackgroundPreference(
  userData: string,
  enabled: boolean
): void {
  mkdirSync(userData, { recursive: true });
  const destination = linuxBackgroundPreferencePath(userData);
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ enabled })}\n`, { mode: 0o600 });
  renameSync(temporary, destination);
}

/** Create, refresh, or remove the XDG entry that starts minddy hidden. */
export function syncLinuxBackgroundAutostart(options: {
  enabled: boolean;
  environment: LinuxBackgroundEnvironment;
  home: string;
  execPath: string;
}): boolean {
  const destination = linuxBackgroundAutostartPath(
    options.environment,
    options.home
  );
  if (!options.enabled) {
    rmSync(destination, { force: true });
    return false;
  }

  mkdirSync(path.dirname(destination), { recursive: true });
  const executable = linuxBackgroundExecutable(
    options.environment,
    options.execPath
  );
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, linuxBackgroundDesktopEntry(executable), {
    mode: 0o644,
  });
  renameSync(temporary, destination);
  return existsSync(destination);
}
