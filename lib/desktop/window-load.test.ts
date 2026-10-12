import { expect, it, vi } from "vitest";
import { loadDesktopWindow } from "./window-load";

it("initiates navigation and consumes network failures and superseded load promises", async () => {
  for (const errno of [-3, -105]) {
    const catchFailure = vi.fn();
    const failedLoad = Promise.reject(Object.assign(new Error("Native navigation failed"), { errno }));
    const catchNative = failedLoad.catch.bind(failedLoad);
    failedLoad.catch = (handler) => { catchFailure(); return catchNative(handler); };
    const target = { isDestroyed: () => false, loadURL: vi.fn(() => failedLoad) };
    loadDesktopWindow(target, "https://minddy.example/home");
    expect(target.loadURL).toHaveBeenCalledExactlyOnceWith("https://minddy.example/home");
    expect(catchFailure).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  }
});

it("ignores windows already destroyed or disposed while starting navigation", () => {
  const target = { isDestroyed: () => true, loadURL: vi.fn() };
  loadDesktopWindow(target, "https://minddy.example/home");
  expect(target.loadURL).not.toHaveBeenCalled();
  const closing = { isDestroyed: () => false, loadURL: vi.fn(() => { throw new Error("Object has been destroyed"); }) };
  expect(() => loadDesktopWindow(closing, "https://minddy.example/home")).not.toThrow();
});
