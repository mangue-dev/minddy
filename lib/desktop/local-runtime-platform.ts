export interface LocalRuntimeProcessSpec {
  command: string;
  args: string[];
  windowsHide?: boolean;
}

/** Builds the platform-native launcher without depending on Electron. */
export function localRuntimeProcessSpec(
  platform: NodeJS.Platform,
  configuredShell?: string
): LocalRuntimeProcessSpec {
  const command = "pnpm self-host:local -- --no-open";
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command],
      windowsHide: true,
    };
  }
  const shell = configuredShell || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  return { command: shell, args: ["-lc", `exec ${command}`] };
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
