import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: h.spawn }));
import { installNativeWorkerCli } from "./native-cli-install";
const roots: string[] = [];
const originalPlatform = process.platform;
afterEach(async () => { Object.defineProperty(process, "platform", { value: originalPlatform }); vi.restoreAllMocks(); h.spawn.mockReset(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it.each([true, false])("reuses a verified pinned runtime only when its version matches (pinned: %s)", async (pinned) => {
  Object.defineProperty(process, "platform", { value: "linux" });
  const root = await mkdtemp(join(tmpdir(), "minddy-cli-cache-")); roots.push(root);
  const manifestDir = join(root, "node_modules/@openai/codex");
  const bins = join(root, "node_modules/.bin");
  await mkdir(manifestDir, { recursive: true }); await mkdir(bins, { recursive: true });
  await writeFile(join(bins, "codex"), "fixture");
  await writeFile(join(manifestDir, "package.json"), JSON.stringify({ version: pinned ? "0.162.1" : "0.1.0" }));
  h.spawn.mockImplementation((program: string) => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; pid: number };
    child.stdout = new PassThrough(); child.pid = 0;
    queueMicrotask(async () => {
      if (program === "npm") await writeFile(join(manifestDir, "package.json"), JSON.stringify({ version: "0.162.1" }));
      child.stdout.write("codex 0.162.1"); child.emit("close", 0);
    });
    return child;
  });
  expect(await installNativeWorkerCli("codex", root)).toBe(bins);
  const install = h.spawn.mock.calls.find(([program]) => program === "npm");
  expect(Boolean(install)).toBe(!pinned);
  if (install) expect(install[1]).toContain("--ignore-scripts");
});
