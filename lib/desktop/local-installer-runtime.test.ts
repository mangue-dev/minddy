import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `desktop/src/local-installer.ts` with its processes, runtime and account
 * mocked: what it runs, in which order, and how it adapts to the release it
 * cloned (which may predate `--prepare-only` and the auto sign-in page).
 */
const mocks = vi.hoisted(() => ({
  runTool: vi.fn(),
  startLocalRuntime: vi.fn(),
  stopLocalRuntime: vi.fn(),
  ensureLocalAccount: vi.fn(),
  home: "",
}));
vi.mock("../../desktop/node_modules/electron", () => ({ app: { getPath: () => mocks.home }, dialog: {} }));
vi.mock("../../desktop/src/local-toolchain", async () => {
  const actual = await vi.importActual<typeof import("../../desktop/src/local-toolchain")>("../../desktop/src/local-toolchain");
  return {
    InstallFailure: actual.InstallFailure,
    installToolchain: vi.fn(),
    macGitStubOnly: vi.fn().mockResolvedValue(false),
    runTool: mocks.runTool,
  };
});
vi.mock("../../desktop/src/local-runtime", () => ({
  startLocalRuntime: mocks.startLocalRuntime,
  stopLocalRuntime: mocks.stopLocalRuntime,
  validateLocalRuntimeRoot: (root: string) => {
    if (!existsSync(path.join(root, "package.json"))) throw new Error("not a clone");
    return root;
  },
}));
vi.mock("../../desktop/src/local-account", () => ({ ensureLocalAccount: mocks.ensureLocalAccount }));
vi.stubGlobal("__MINDDY_SELF_HOSTING_RELEASE__", "0.20.1");

let home: string;
let folder: string;

function clone({ managed, prepareOnly, accountPage }: { managed: boolean; prepareOnly: boolean; accountPage: boolean }) {
  mkdirSync(path.join(folder, ".git"), { recursive: true });
  mkdirSync(path.join(folder, "scripts"), { recursive: true });
  writeFileSync(path.join(folder, "package.json"), "{}");
  writeFileSync(
    path.join(folder, "scripts", "self-hosting-local.mjs"),
    prepareOnly ? '} else if (arg === "--prepare-only") {' : '} else if (arg === "--keep-backend") {',
  );
  if (managed) writeFileSync(path.join(folder, ".git", "minddy-desktop-install"), "");
  if (accountPage) {
    mkdirSync(path.join(folder, "components", "auth"), { recursive: true });
    writeFileSync(path.join(folder, "components", "auth", "desktop-local-sign-in.tsx"), "");
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  home = mkdtempSync(path.join(tmpdir(), "minddy-install-home-"));
  mocks.home = home;
  folder = path.join(home, "minddy");
  mocks.runTool.mockImplementation(async (argv: string[]) => ({
    ok: true,
    stdout: argv[0] === "node" ? "v24.22.1" : "1.0.0",
    output: "",
  }));
  mocks.startLocalRuntime.mockResolvedValue(undefined);
  mocks.ensureLocalAccount.mockResolvedValue(undefined);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

async function install() {
  // `installFolder()` defaults to <home>/minddy, the folder each test prepares.
  const installer = await import("../../desktop/src/local-installer");
  const steps: string[] = [];
  const result = await installer.runLocalInstall((progress) => {
    if (progress.state !== "running") steps.push(`${progress.step}:${progress.state}`);
  });
  return { result, steps, commands: mocks.runTool.mock.calls.map(([argv]) => (argv as string[]).join(" ")) };
}

describe("local installer flow", () => {
  it("resumes its own clone and uses every step of a release that has them", async () => {
    clone({ managed: true, prepareOnly: true, accountPage: true });
    const { result, steps, commands } = await install();
    expect(result).toEqual({ root: folder, managedAccount: true });
    expect(steps).toEqual(["clone:skipped", "dependencies:done", "configure:done", "prepare:done", "start:done", "account:done"]);
    expect(commands).toContain("pnpm self-host:local -- --no-open --prepare-only");
    expect(readFileSync(path.join(folder, ".env.local"), "utf8")).toContain("ADMIN_EMAILS=owner@local.minddy.app");
    expect(mocks.stopLocalRuntime).toHaveBeenCalled();
  });

  it("skips the steps a release predates and keeps its usual sign-up", async () => {
    clone({ managed: true, prepareOnly: false, accountPage: false });
    const { result, steps, commands } = await install();
    expect(result).toEqual({ root: folder, managedAccount: false });
    expect(steps).toContain("prepare:skipped");
    expect(steps).toContain("account:skipped");
    expect(commands.some((command) => command.includes("--prepare-only"))).toBe(false);
    expect(mocks.ensureLocalAccount).not.toHaveBeenCalled();
    expect(existsSync(path.join(folder, ".env.local"))).toBe(false);
  });

  it("never takes over a clone the person made", async () => {
    clone({ managed: false, prepareOnly: true, accountPage: true });
    const { result, commands } = await install();
    expect(result).toEqual({ error: { code: "folderIsInstallation" } });
    expect(commands.filter((command) => command.startsWith("pnpm"))).toEqual([]);
  });
});
