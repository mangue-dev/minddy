import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, dialog, type BrowserWindow } from "electron";

import {
  DEPENDENCIES_ARGUMENTS,
  DOCKER_DAEMON_PROBE,
  LOCAL_INSTALL_STEPS,
  LOCAL_PREREQUISITES,
  LOCAL_PREREQUISITE_INFO,
  MANAGED_ACCOUNT_PAGE,
  MANAGED_INSTALL_MARKER,
  PREPARE_ARGUMENTS,
  cloneArguments,
  cloneNeeded,
  evaluatePrerequisite,
  folderAcceptable,
  installMessage,
  lastOutputLine,
  launcherSupportsPrepareOnly,
  withAdminEmail,
  withConfigOverrides,
  type InstallMessage,
  type LocalInstallFolderState,
  type LocalInstallProgress,
  type LocalInstallStep,
  type LocalPrerequisiteResult,
} from "@/lib/desktop/local-installer";
import { toolchainPlan } from "@/lib/desktop/local-toolchain";
import { startLocalRuntime, stopLocalRuntime, validateLocalRuntimeRoot } from "./local-runtime";
import { InstallFailure, installToolchain, macGitStubOnly, runTool } from "./local-toolchain";
import { ensureLocalAccount } from "./local-account";
import { LOCAL_ACCOUNT_EMAIL } from "@/lib/desktop/local-account";

/** Injected by `scripts/build-desktop.mjs` from the compatibility table. */
declare const __MINDDY_SELF_HOSTING_RELEASE__: string;

/** The release the installer clones, as the server-choice page names it. */
export const LOCAL_INSTALL_RELEASE = __MINDDY_SELF_HOSTING_RELEASE__;

let selectedFolder: string | null = null;
let current: { controller: AbortController; step: LocalInstallStep | null } | null = null;

export function defaultInstallFolder(): string {
  return path.join(app.getPath("home"), "minddy");
}

/** The folder the next installation writes to; only the main process sets it. */
export function installFolder(): string {
  return selectedFolder ?? defaultInstallFolder();
}

function inspectFolder(folder: string): LocalInstallFolderState {
  if (!existsSync(folder)) return "absent";
  try {
    validateLocalRuntimeRoot(folder);
    return existsSync(path.join(folder, MANAGED_INSTALL_MARKER)) ? "minddy" : "installation";
  } catch {
    // Not a minddy clone: look at what else is there.
  }
  try {
    const entries = readdirSync(folder).filter((name) => name !== ".DS_Store");
    return entries.length === 0 ? "empty" : "occupied";
  } catch {
    return "occupied";
  }
}

/**
 * The native folder dialog. Choosing a folder that already holds other files
 * (`~/Projects`) installs into a `minddy` folder inside it rather than
 * refusing: that is what the person meant.
 */
export async function chooseInstallFolder(
  parent: BrowserWindow,
): Promise<{ folder?: string; error?: InstallMessage }> {
  const selection = await dialog.showOpenDialog(parent, {
    defaultPath: path.dirname(installFolder()),
    properties: ["openDirectory", "createDirectory"],
  });
  const chosen = selection.filePaths[0];
  if (selection.canceled || !chosen) return { folder: installFolder() };
  const candidates = [chosen, path.join(chosen, "minddy")];
  const folder = candidates.find((candidate) => folderAcceptable(inspectFolder(candidate)));
  if (!folder) return { folder: installFolder(), error: installMessage("folderNotEmpty") };
  selectedFolder = folder;
  return { folder };
}

/** Probes the five tools of the local profile, in parallel. */
export async function checkLocalPrerequisites(): Promise<LocalPrerequisiteResult[]> {
  const gitStub = await macGitStubOnly();
  return Promise.all(
    LOCAL_PREREQUISITES.map(async (id) => {
      if (id === "git" && gitStub) return { id, state: "missing" as const };
      const probe = await runTool(LOCAL_PREREQUISITE_INFO[id].probe, { timeoutMs: 15_000 });
      const daemon =
        id === "docker" && probe.ok
          ? await runTool(DOCKER_DAEMON_PROBE, { timeoutMs: 15_000 })
          : undefined;
      return evaluatePrerequisite(id, probe, daemon);
    }),
  );
}

/** Whether an installation runs, so a reloaded page shows its progress. */
export function localInstallRunning(): boolean {
  return current !== null;
}

export function cancelLocalInstall(): void {
  if (!current) return;
  current.controller.abort();
  if (current.step === "start") stopLocalRuntime();
}

/**
 * Runs the installation and reports each step. Resolves with the installed
 * folder, or an error the window shows as is. The caller owns what follows
 * a success: remembering the folder and switching the window to it.
 */
export async function runLocalInstall(
  report: (progress: LocalInstallProgress) => void,
): Promise<{ root?: string; managedAccount?: boolean; error?: InstallMessage }> {
  if (current) return { error: installMessage("installBusy") };
  const folder = installFolder();
  const folderState = inspectFolder(folder);
  if (!folderAcceptable(folderState)) {
    return { error: installMessage(folderState === "installation" ? "folderIsInstallation" : "folderNotEmpty") };
  }

  const attempt = { controller: new AbortController(), step: null as LocalInstallStep | null };
  current = attempt;
  const { signal } = attempt.controller;
  let lastReport = 0;
  const begin = (step: LocalInstallStep) => {
    attempt.step = step;
    report({ step, state: "running" });
  };
  const live = (step: LocalInstallStep) => (line: string) => {
    // Throttled: `pnpm install` prints hundreds of lines a second.
    const now = Date.now();
    if (now - lastReport < 250) return;
    lastReport = now;
    report({ step, state: "running", detail: { text: line } });
  };
  const run = async (step: LocalInstallStep, argv: readonly string[], cwd: string) => {
    const result = await runTool(argv, { cwd, signal, onOutput: live(step) });
    if (signal.aborted) throw new InstallFailure(installMessage("installCanceled"));
    if (!result.ok) {
      const line = lastOutputLine(result.output);
      throw new InstallFailure(line ? { text: line } : installMessage("localStartFailed"));
    }
    report({ step, state: "done" });
  };

  try {
    // Missing tools first, each its own step; then a second look, so a tool
    // that installed but still does not answer stops here with its name.
    const plan = toolchainPlan(await checkLocalPrerequisites());
    await installToolchain(plan, signal, (action, state, detail) => {
      attempt.step = action;
      report({ step: action, state, detail });
    });
    if (plan.length > 0) {
      const missing = (await checkLocalPrerequisites()).find((result) => result.state !== "ready");
      if (missing) {
        throw new InstallFailure(installMessage("toolStillMissing", { tool: LOCAL_PREREQUISITE_INFO[missing.id].name }));
      }
    }

    if (cloneNeeded(folderState)) {
      begin("clone");
      mkdirSync(path.dirname(folder), { recursive: true });
      await run("clone", cloneArguments(`v${LOCAL_INSTALL_RELEASE}`, folder), path.dirname(folder));
      writeFileSync(path.join(folder, MANAGED_INSTALL_MARKER), "", "utf8");
    } else {
      report({ step: "clone", state: "skipped" });
    }

    begin("dependencies");
    await run("dependencies", DEPENDENCIES_ARGUMENTS, folder);

    begin("configure");
    const root = validateLocalRuntimeRoot(folder);
    // What the cloned release can do: it may predate the steps below.
    const managedAccount = existsSync(path.join(root, MANAGED_ACCOUNT_PAGE));
    const prepareOnly = launcherSupportsPrepareOnly(
      readFileSync(path.join(root, "scripts", "self-hosting-local.mjs"), "utf8"),
    );
    if (managedAccount) {
      const envFile = path.join(root, ".env.local");
      const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
      writeFileSync(envFile, withConfigOverrides(withAdminEmail(env, LOCAL_ACCOUNT_EMAIL)), { encoding: "utf8", mode: 0o600 });
    }
    report({ step: "configure", state: "done" });

    // A local instance the app already runs holds the port and the build.
    stopLocalRuntime();
    if (prepareOnly) {
      begin("prepare");
      await run("prepare", PREPARE_ARGUMENTS, root);
    } else {
      report({ step: "prepare", state: "skipped" });
    }

    begin("start");
    await startLocalRuntime(root);
    if (signal.aborted) throw new InstallFailure(installMessage("installCanceled"));
    report({ step: "start", state: "done" });

    // The owner the app signs in with: no email, no password to type. A
    // release without the auto sign-in page keeps its usual sign-up.
    if (managedAccount) {
      begin("account");
      await ensureLocalAccount(root);
      if (signal.aborted) throw new InstallFailure(installMessage("installCanceled"));
      report({ step: "account", state: "done" });
    } else {
      report({ step: "account", state: "skipped" });
    }
    return { root, managedAccount };
  } catch (error) {
    const detail: InstallMessage =
      error instanceof InstallFailure
        ? error.detail
        : signal.aborted
          ? installMessage("installCanceled")
          : error instanceof Error
            ? { text: error.message }
            : installMessage("localStartFailed");
    const failed = attempt.step ?? LOCAL_INSTALL_STEPS[0];
    report({ step: failed, state: "failed", detail });
    return { error: detail };
  } finally {
    if (current === attempt) current = null;
  }
}
