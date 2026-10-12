import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));
let windows: PickerWindow[] = [];
class PickerWindow extends EventEmitter {
  webContents = {};
  closed = false;
  show = vi.fn();
  focus = vi.fn();
  loadURL = vi.fn().mockResolvedValue(undefined);
  isDestroyed = () => this.closed;
  close = vi.fn(() => { this.closed = true; this.emit("closed"); });
  constructor() {
    super();
    windows.push(this);
  }
}
vi.mock("../../desktop/node_modules/electron", () => ({
  BrowserWindow: PickerWindow,
  ipcMain: mocks,
}));
vi.mock("../../desktop/src/shell-font", () => ({ desktopShellFontDataUrl: () => undefined }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  windows = [];
});

async function setup(onUseLocal: () => Promise<{ error?: string }>) {
  const { openServerPicker } = await import("../../desktop/src/server-picker");
  openServerPicker({
    parent: {} as Parameters<typeof openServerPicker>[0]["parent"],
    currentOrigin: "https://www.minddy.app",
    isCustomServer: false,
    onSave: vi.fn(),
    onUseCloud: vi.fn(),
    onUseLocal,
  });
  const localHandler = mocks.handle.mock.calls.find(([name]) => name === "minddy:server-picker:local")![1];
  return { picker: windows[0], local: () => localHandler({ sender: windows[0].webContents }) as Promise<{ error?: string }> };
}

describe("desktop server picker local startup", () => {
  it("shares a pending folder selection and startup across repeated local clicks", async () => {
    let resolve!: (result: { error?: string }) => void;
    const onUseLocal = vi.fn(() => new Promise<{ error?: string }>(done => { resolve = done; }));
    const { picker, local } = await setup(onUseLocal);
    const first = local();
    const second = local();
    expect(onUseLocal).toHaveBeenCalledTimes(1);
    resolve({});
    await expect(first).resolves.toEqual({});
    await expect(second).resolves.toEqual({});
    expect(picker.close).toHaveBeenCalledTimes(1);
  });

  it("returns a startup failure to the form and permits retry", async () => {
    const onUseLocal = vi.fn().mockRejectedValueOnce(new Error("Folder dialog closed unexpectedly")).mockResolvedValueOnce({});
    const { picker, local } = await setup(onUseLocal);
    await expect(local()).resolves.toEqual({ error: "Folder dialog closed unexpectedly" });
    expect(picker.close).not.toHaveBeenCalled();
    await expect(local()).resolves.toEqual({});
    expect(picker.close).toHaveBeenCalledTimes(1);
  });

  it("does not close a replacement picker when an old startup resolves", async () => {
    let resolve!: (result: { error?: string }) => void;
    const first = await setup(() => new Promise(done => { resolve = done; }));
    const startup = first.local();
    first.picker.close();
    const { openServerPicker } = await import("../../desktop/src/server-picker");
    openServerPicker({
      parent: {} as Parameters<typeof openServerPicker>[0]["parent"],
      currentOrigin: "https://www.minddy.app",
      isCustomServer: false,
      onSave: vi.fn(), onUseCloud: vi.fn(), onUseLocal: vi.fn(),
    });
    const replacement = windows[1];
    resolve({});
    await startup;
    expect(replacement.close).not.toHaveBeenCalled();
  });
});
