export interface LocalRuntimeProcessSpec {
  command: string;
  args: string[];
  windowsHide?: boolean;
}

export type LocalRuntimeStartupState = "start" | "ready" | "external";

/** Distinguishes a desktop-owned server from one started in another terminal. */
export function localRuntimeStartupState(
  healthy: boolean,
  ownsLiveProcess: boolean,
): LocalRuntimeStartupState {
  if (!healthy) return "start";
  return ownsLiveProcess ? "ready" : "external";
}

/**
 * Builds the platform-native launcher without depending on Electron.
 *
 * `pathPrefix` holds the tools the desktop installer manages (MIN-781). On
 * POSIX it is exported AFTER the login profile ran: macOS's `path_helper`
 * reorders an inherited PATH and would put an older system Node.js back in
 * front. `cmd.exe` keeps the PATH it inherits, so Windows takes the prefix
 * through the environment instead (`env`).
 */
export function localRuntimeProcessSpec(
  platform: NodeJS.Platform,
  configuredShell?: string,
  pathPrefix: readonly string[] = [],
): LocalRuntimeProcessSpec & { pathPrefix?: string } {
  const command = "pnpm self-host:local -- --no-open";
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command],
      windowsHide: true,
      ...(pathPrefix.length > 0 ? { pathPrefix: pathPrefix.join(";") } : {}),
    };
  }
  const shell = configuredShell || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const exportPath =
    pathPrefix.length > 0 ? `export PATH=${pathPrefix.map(posixQuote).join(":")}:"$PATH"; ` : "";
  return { command: shell, args: ["-lc", `${exportPath}exec ${command}`] };
}

/** Single-quoted for a POSIX shell: folder names are the person's. */
export function posixQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** Windows needs an explicit tree kill; POSIX can signal the exec-replaced child. */
export function localRuntimeStopSpec(
  platform: NodeJS.Platform,
  pid: number
): LocalRuntimeProcessSpec | null {
  if (platform !== "win32") return null;
  return {
    command: "taskkill.exe",
    args: ["/pid", String(pid), "/t", "/f"],
    windowsHide: true,
  };
}
