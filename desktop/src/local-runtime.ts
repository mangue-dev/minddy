import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export const LOCAL_SELF_HOST_ORIGIN = "http://localhost:6463";
const LOCAL_RUNTIME_FILE = "local-runtime.json";
let runtime: ChildProcess | null = null;

function runtimeFile(): string {
  return path.join(app.getPath("userData"), LOCAL_RUNTIME_FILE);
}

/** Accepts only a minddy clone that exposes the supported local launcher. */
export function validateLocalRuntimeRoot(root: string): string {
  const normalized = path.resolve(root);
  let packageJson: { scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(readFileSync(path.join(normalized, "package.json"), "utf8"));
  } catch {
    throw new Error("Choose the minddy folder created during local installation.");
  }
  if (packageJson.scripts?.["self-host:local"] !== "node scripts/self-hosting-local.mjs") {
    throw new Error("This folder does not contain the supported minddy local launcher.");
  }
  return normalized;
}

export function readLocalRuntimeRoot(): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(runtimeFile(), "utf8"));
    if (typeof raw !== "object" || raw === null || typeof (raw as { root?: unknown }).root !== "string") return null;
    return validateLocalRuntimeRoot((raw as { root: string }).root);
  } catch {
    return null;
  }
}

export function writeLocalRuntimeRoot(root: string): string {
  const normalized = validateLocalRuntimeRoot(root);
  writeFileSync(runtimeFile(), `${JSON.stringify({ root: normalized }, null, 2)}\n`, "utf8");
  return normalized;
}

async function isHealthy(): Promise<boolean> {
  try {
    return (await fetch(`${LOCAL_SELF_HOST_ORIGIN}/api/health`)).ok;
  } catch {
    return false;
  }
}

/** Starts Supabase and minddy together, then resolves when the app is ready. */
export async function startLocalRuntime(root: string): Promise<void> {
  if (await isHealthy()) return;
  if (runtime && runtime.exitCode === null) return;
  const validatedRoot = validateLocalRuntimeRoot(root);
  const command = process.platform === "win32" ? "pnpm self-host:local -- --no-open" : "exec pnpm self-host:local -- --no-open";
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  runtime = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], { cwd: validatedRoot, stdio: "ignore", windowsHide: true })
    : spawn(shell, ["-lc", command], { cwd: validatedRoot, stdio: "ignore" });

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (runtime.exitCode !== null) throw new Error(`The local launcher stopped with code ${runtime.exitCode}. Open Terminal and run pnpm self-host:local to see its output.`);
    if (await isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  stopLocalRuntime();
  throw new Error("minddy did not become ready within 10 minutes. Check Docker, then try again.");
}

/** Lets the launcher stop both the web process and its local Supabase backend. */
export function stopLocalRuntime(): void {
  if (runtime && runtime.exitCode === null) runtime.kill("SIGTERM");
  runtime = null;
}
