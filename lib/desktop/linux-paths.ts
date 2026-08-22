import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The state locations owned by the Linux desktop shell.
 *
 * Electron's defaults currently follow XDG, but setting these paths before
 * `ready` makes the persisted server choice, local runtime and agent files a
 * stable part of minddy's Linux contract instead of an implementation detail.
 */
export interface LinuxDesktopPaths {
  userData: string;
  cache: string;
  logs: string;
}

export interface LinuxXdgEnvironment {
  XDG_CONFIG_HOME?: string;
  XDG_CACHE_HOME?: string;
  XDG_STATE_HOME?: string;
}

function xdgHome(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  return candidate && path.isAbsolute(candidate) ? candidate : fallback;
}

/** Resolves XDG homes, ignoring invalid relative values as the specification requires. */
export function linuxDesktopPaths(
  environment: LinuxXdgEnvironment,
  home: string,
  appName: string
): LinuxDesktopPaths {
  const configHome = xdgHome(environment.XDG_CONFIG_HOME, path.join(home, ".config"));
  const cacheHome = xdgHome(environment.XDG_CACHE_HOME, path.join(home, ".cache"));
  const stateHome = xdgHome(environment.XDG_STATE_HOME, path.join(home, ".local", "state"));

  return {
    userData: path.join(configHome, appName),
    cache: path.join(cacheHome, appName),
    logs: path.join(stateHome, appName, "logs"),
  };
}

/**
 * Electron refuses to override a path with a directory that does not exist.
 * Create the resolved XDG locations before main.ts passes them to Electron.
 */
export function prepareLinuxDesktopPaths(paths: LinuxDesktopPaths): void {
  for (const directory of Object.values(paths)) {
    mkdirSync(directory, { recursive: true });
  }
}
