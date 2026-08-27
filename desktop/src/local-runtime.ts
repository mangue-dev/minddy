import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  localRuntimeProcessSpec,
  localRuntimeStartupState,
  localRuntimeStopSpec,
} from "@/lib/desktop/local-runtime-platform";

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
  const startupState = localRuntimeStartupState(
    await isHealthy(),
    runtime !== null && runtime.exitCode === null,
  );
  if (startupState === "ready") return;
  if (startupState === "external") {
    throw new Error(
      "Local minddy is already running outside the desktop app. Stop it in its terminal with Ctrl+C, then try again.",
    );
  }
  if (runtime && runtime.exitCode === null) return;
  const validatedRoot = validateLocalRuntimeRoot(root);
  const spec = localRuntimeProcessSpec(process.platform, process.env.SHELL);
  runtime = spawn(spec.command, spec.args, {
    cwd: validatedRoot,
    stdio: "ignore",
    windowsHide: spec.windowsHide,
  });

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
  if (runtime && runtime.exitCode === null) {
    const spec = runtime.pid ? localRuntimeStopSpec(process.platform, runtime.pid) : null;
    if (spec) {
      // `cmd.exe` is only the launcher. Terminate its complete process tree so
      // pnpm, Supabase, and the local Next.js server do not survive app exit.
      spawn(spec.command, spec.args, {
        stdio: "ignore",
        windowsHide: spec.windowsHide,
      });
    } else {
      runtime.kill("SIGTERM");
    }
  }
  runtime = null;
}
