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
}));
const updater = Object.assign(new EventEmitter(), {
  checkForUpdates: mocks.checkForUpdates,
  quitAndInstall: mocks.quitAndInstall,
});

vi.mock("../../desktop/node_modules/electron", () => ({
  app: { isPackaged: true, getVersion: () => "0.11.1" },
  dialog: { showMessageBox: mocks.showMessageBox },
}));
vi.mock("../../desktop/node_modules/electron-updater", () => ({ autoUpdater: updater }));
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
  mocks.isDestroyed.mockReturnValue(false);
  mocks.isVisible.mockReturnValue(true);
  mocks.contentsDestroyed.mockReturnValue(false);
  window = {
    isDestroyed: mocks.isDestroyed,
    isVisible: mocks.isVisible,
    webContents: { isDestroyed: mocks.contentsDestroyed, send: mocks.send },
  } as unknown as NonNullable<typeof window>;
  shell = await import("../../desktop/src/updater");
  shell.startAutoUpdates(() => window);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("desktop updater installation lifecycle", () => {
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
});
