import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

beforeEach(() => vi.resetModules());
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function profile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "minddy-push-installation-"));
  directories.push(directory);
  return directory;
}

describe("pushInstallationId", () => {
  it("shares one persisted identity across concurrent first-launch registrations", async () => {
    const directory = await profile();
    const { pushInstallationId } = await import("../../desktop/src/push-installation-store");
    const ids = await Promise.all(Array.from({ length: 12 }, () => pushInstallationId(directory)));

    expect(new Set(ids).size).toBe(1);
    expect((await readFile(path.join(directory, "push-installation-id"), "utf8")).trim()).toBe(ids[0]);
  });

  it("keeps separate desktop profiles independent", async () => {
    const first = await profile();
    const second = await profile();
    const { pushInstallationId } = await import("../../desktop/src/push-installation-store");
    const firstId = await pushInstallationId(first);
    const secondId = await pushInstallationId(second);

    expect(secondId).not.toBe(firstId);
    expect((await readFile(path.join(second, "push-installation-id"), "utf8")).trim()).toBe(secondId);
  });

  it("retries after a failed write instead of caching a rejected registration", async () => {
    const directory = await profile();
    const blockedProfile = path.join(directory, "blocked");
    await writeFile(blockedProfile, "not a directory");
    const { pushInstallationId } = await import("../../desktop/src/push-installation-store");

    await expect(pushInstallationId(blockedProfile)).rejects.toThrow();
    await rm(blockedProfile);
    const id = await pushInstallationId(blockedProfile);

    expect((await readFile(path.join(blockedProfile, "push-installation-id"), "utf8")).trim()).toBe(id);
  });

  it("reuses the stored identity after a process restart", async () => {
    const directory = await profile();
    const firstProcess = await import("../../desktop/src/push-installation-store");
    const id = await firstProcess.pushInstallationId(directory);
    vi.resetModules();
    const nextProcess = await import("../../desktop/src/push-installation-store");

    expect(await nextProcess.pushInstallationId(directory)).toBe(id);
  });
});

describe("disableNativePush", () => {
  it("persists opt-out even while native cleanup is still waiting", async () => {
    const directory = await profile();
    const { disableNativePush, nativePushAllowed, setNativePushAllowed } = await import("../../desktop/src/push-installation-store");
    await setNativePushAllowed(directory, true);
    let cleanupStarted!: () => void;
    let finishCleanup!: () => void;
    const started = new Promise<void>(resolve => { cleanupStarted = resolve; });
    const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
    const disable = disableNativePush(directory, () => { cleanupStarted(); return cleanup; });
    await started;

    try {
      // A process exiting at this point must not opt back in on its next launch.
      expect(await nativePushAllowed(directory)).toBe(false);
    } finally {
      finishCleanup();
      await disable;
    }
  });

  it("keeps opt-out durable when native cleanup fails", async () => {
    const directory = await profile();
    const { disableNativePush, nativePushAllowed, setNativePushAllowed } = await import("../../desktop/src/push-installation-store");
    await setNativePushAllowed(directory, true);

    await expect(disableNativePush(directory, () => Promise.reject(new Error("Native cleanup failed")))).rejects.toThrow("Native cleanup failed");

    expect(await nativePushAllowed(directory)).toBe(false);
  });
});
