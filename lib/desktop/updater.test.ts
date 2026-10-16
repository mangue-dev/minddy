import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  isDestroyed: vi.fn(),
  isVisible: vi.fn(),
  contentsDestroyed: vi.fn(),
  send: vi.fn(),
  app: { isPackaged: true, getVersion: () => "0.11.1" },
  updaterPackage: vi.fn(),
  requireAutoUpdater: vi.fn(),
}));
const updater = Object.assign(new EventEmitter(), {
  checkForUpdates: mocks.checkForUpdates,
  quitAndInstall: mocks.quitAndInstall,
});

vi.mock("../../desktop/node_modules/electron", () => ({
  app: mocks.app,
  dialog: { showMessageBox: mocks.showMessageBox },
}));
// Evaluated only if something imports the package itself: the shell must
// reach it through the lazy loader below, never at module scope.
vi.mock("../../desktop/node_modules/electron-updater", () => mocks.updaterPackage());
vi.mock("../../desktop/src/updater-module", () => ({ requireAutoUpdater: mocks.requireAutoUpdater }));
vi.mock("./update-platform", () => ({
  supportsAutomaticDesktopUpdates: () => true,
  manualDesktopUpdateMessage: () => null,
}));

let shell: typeof import("../../desktop/src/updater");
let window: Parameters<typeof shell.startAutoUpdates>[0] extends () => infer W ? W : never;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  updater.removeAllListeners();
  mocks.checkForUpdates.mockResolvedValue(null);
  mocks.app.isPackaged = true;
  mocks.updaterPackage.mockReturnValue({ autoUpdater: updater });
  mocks.requireAutoUpdater.mockReturnValue(updater);
  mocks.isDestroyed.mockReturnValue(false);
  mocks.isVisible.mockReturnValue(true);
  mocks.contentsDestroyed.mockReturnValue(false);
  window = {
    isDestroyed: mocks.isDestroyed,
    isVisible: mocks.isVisible,
    webContents: { isDestroyed: mocks.contentsDestroyed, send: mocks.send },
  } as unknown as NonNullable<typeof window>;
  shell = await import("../../desktop/src/updater");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("desktop updater loading", () => {
  it("does not load electron-updater when the shell module is evaluated", () => {
    expect(mocks.updaterPackage).not.toHaveBeenCalled();
    expect(mocks.requireAutoUpdater).not.toHaveBeenCalled();
  });

  it("never loads it in an unpackaged run", async () => {
    mocks.app.isPackaged = false;
    shell.startAutoUpdates(() => window);
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
    expect(mocks.requireAutoUpdater).not.toHaveBeenCalled();
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
  });

  it("loads it once, after the startup delay, and keeps the six-hour checks", async () => {
    shell.startAutoUpdates(() => window);
    await vi.advanceTimersByTimeAsync(shell.FIRST_UPDATE_CHECK_DELAY_MS - 1);
    expect(mocks.requireAutoUpdater).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.requireAutoUpdater).toHaveBeenCalledOnce();
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(mocks.requireAutoUpdater).toHaveBeenCalledOnce();
    expect(updater.listenerCount("update-downloaded")).toBe(1);
  });

  it("wires the automatic download when a manual check loads the updater first", async () => {
    shell.startAutoUpdates(() => window);
    mocks.showMessageBox.mockResolvedValue({ response: 1 });
    await shell.checkForUpdatesManually();
    expect(mocks.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: "minddy 0.11.1 is up to date." }));
    updater.emit("update-downloaded", { version: "0.11.2" });
    expect(shell.currentUpdateStatus()).toEqual({ state: "ready", version: "0.11.2" });
    await vi.advanceTimersByTimeAsync(shell.FIRST_UPDATE_CHECK_DELAY_MS);
    expect(updater.listenerCount("update-downloaded")).toBe(1);
  });

  it("logs a failed load instead of crashing the shell", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireAutoUpdater.mockImplementation(() => { throw new Error("Cannot find module"); });
    shell.startAutoUpdates(() => window);
    await vi.advanceTimersByTimeAsync(shell.FIRST_UPDATE_CHECK_DELAY_MS);
    expect(error).toHaveBeenCalledWith("[updater] load_failed", expect.any(Error));
  });
});

describe("desktop updater installation lifecycle", () => {
  beforeEach(async () => {
    shell.startAutoUpdates(() => window);
    await vi.advanceTimersByTimeAsync(shell.FIRST_UPDATE_CHECK_DELAY_MS);
  });

  it("shares one install dialog and relaunch when requests overlap", async () => {
    let respond!: (value: { response: number }) => void;
    mocks.showMessageBox.mockImplementation(() => new Promise((resolve) => { respond = resolve; }));
    updater.emit("update-downloaded", { version: "0.11.2" });
    shell.requestInstall();
    const manual = shell.checkForUpdatesManually();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    respond({ response: 0 });
    await manual;
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("retains a ready update when its native dialog fails and permits retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.showMessageBox.mockRejectedValueOnce(new Error("Window closed"));
    updater.emit("update-downloaded", { version: "0.11.2" });
    await shell.checkForUpdatesManually();
    expect(shell.currentUpdateStatus()).toEqual({ state: "ready", version: "0.11.2" });
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    mocks.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await shell.checkForUpdatesManually();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it("uses an unattached dialog after the owner window is destroyed", async () => {
    mocks.isDestroyed.mockReturnValue(true);
    mocks.showMessageBox.mockResolvedValue({ response: 1 });
    updater.emit("update-downloaded", { version: "0.11.2" });
    await shell.checkForUpdatesManually();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.isVisible).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "minddy 0.11.2 is ready to install." }),
    );
  });

  it("does not reopen an accepted install prompt before the scheduled restart runs", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    updater.emit("update-downloaded", { version: "0.11.2" });
    await shell.checkForUpdatesManually();
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    await shell.checkForUpdatesManually();
    shell.requestInstall();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("handles a later download rejection from an automatic check", async () => {
    let reject!: (error: Error) => void;
    const downloadPromise = new Promise<void>((_resolve, fail) => { reject = fail; });
    const catchDownload = vi.spyOn(downloadPromise, "catch");
    mocks.checkForUpdates.mockResolvedValueOnce({ downloadPromise });
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(catchDownload).toHaveBeenCalledTimes(1);
    reject(new Error("Download interrupted"));
    await Promise.resolve();
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  it("handles a later download rejection after a manual check reports progress", async () => {
    let reject!: (error: Error) => void;
    const downloadPromise = new Promise<void>((_resolve, fail) => { reject = fail; });
    const catchDownload = vi.spyOn(downloadPromise, "catch");
    mocks.checkForUpdates.mockResolvedValueOnce({ downloadPromise, updateInfo: { version: "0.11.2" } });
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    await shell.checkForUpdatesManually();
    expect(catchDownload).toHaveBeenCalledTimes(1);
    expect(mocks.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: "minddy 0.11.2 is downloading." }));
    reject(new Error("Download interrupted"));
    await Promise.resolve();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
  });
});
