import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMediaAccessStatus: vi.fn(), askForMediaAccess: vi.fn() }));
vi.mock("../../desktop/node_modules/electron", () => ({ systemPreferences: mocks }));

import { grantDesktopMicrophoneAccess } from "../../desktop/src/microphone-access";

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

it("does not query macOS permissions on other desktop platforms", async () => {
  await expect(grantDesktopMicrophoneAccess(vi.fn(), "win32")).resolves.toBe(true);
  await expect(grantDesktopMicrophoneAccess(vi.fn(), "linux")).resolves.toBe(true);
  expect(mocks.getMediaAccessStatus).not.toHaveBeenCalled();
});

it("requests unresolved macOS permission and preserves the native answer", async () => {
  const settings = vi.fn();
  mocks.getMediaAccessStatus.mockReturnValue("not-determined");
  mocks.askForMediaAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(grantDesktopMicrophoneAccess(settings, "darwin")).resolves.toBe(true);
  await expect(grantDesktopMicrophoneAccess(settings, "darwin")).resolves.toBe(false);
  expect(mocks.askForMediaAccess).toHaveBeenNthCalledWith(1, "microphone");
  expect(settings).not.toHaveBeenCalled();
});

it("denies the request when the native permission operation rejects or throws", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const callback = vi.fn();
  mocks.getMediaAccessStatus.mockReturnValue("not-determined");
  mocks.askForMediaAccess.mockRejectedValueOnce(new Error("Permission service unavailable"));
  await grantDesktopMicrophoneAccess(vi.fn(), "darwin").then(callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(false);
  mocks.getMediaAccessStatus.mockImplementationOnce(() => { throw new Error("Permission status unavailable"); });
  await expect(grantDesktopMicrophoneAccess(vi.fn(), "darwin")).resolves.toBe(false);
  expect(log).toHaveBeenCalledTimes(2);
});

it("denies promptly while a settings dialog is pending and contains its later rejection", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getMediaAccessStatus.mockReturnValue("denied");
  let reject!: (error: Error) => void;
  const settings = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  await expect(grantDesktopMicrophoneAccess(settings, "darwin")).resolves.toBe(false);
  expect(mocks.askForMediaAccess).not.toHaveBeenCalled();
  reject(new Error("Window closed"));
  await Promise.resolve();
  expect(log).toHaveBeenCalledExactlyOnceWith("[desktop] microphone_settings_failed");
});

it("does not open Settings when microphone permission is already granted", async () => {
  mocks.getMediaAccessStatus.mockReturnValue("granted");
  const settings = vi.fn();
  await expect(grantDesktopMicrophoneAccess(settings, "darwin")).resolves.toBe(true);
  expect(settings).not.toHaveBeenCalled();
});
