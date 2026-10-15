import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profile = vi.hoisted(() => ({ directory: "" }));
vi.mock("../../desktop/node_modules/electron", () => ({
  app: { getPath: () => profile.directory },
}));

beforeEach(async () => {
  vi.resetModules();
  profile.directory = await mkdtemp(path.join(os.tmpdir(), "minddy-window-chrome-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(profile.directory, { recursive: true, force: true });
});

describe("window chrome store", () => {
  it("starts with no observation on a fresh profile and keeps a written one", async () => {
    const store = await import("../../desktop/src/window-chrome-store");
    expect(store.readWindowChrome()).toBeNull();
    expect(store.writeWindowChrome({ origin: "https://minddy.example.test", integrated: true })).toBe(true);
    expect(store.readWindowChrome()).toEqual({ origin: "https://minddy.example.test", integrated: true });
    expect(JSON.parse(await readFile(path.join(profile.directory, "window-chrome.json"), "utf8")))
      .toEqual({ origin: "https://minddy.example.test", integrated: true });
  });

  it("forgets a truncated or foreign file instead of failing the launch", async () => {
    const store = await import("../../desktop/src/window-chrome-store");
    const file = path.join(profile.directory, "window-chrome.json");
    await writeFile(file, '{"origin":"https://minddy.exa');
    expect(store.readWindowChrome()).toBeNull();
    await writeFile(file, JSON.stringify({ origin: "https://minddy.example.test", integrated: "yes" }));
    expect(store.readWindowChrome()).toBeNull();
  });

  it("reports a failed write so the next launch only costs one replacement", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    profile.directory = path.join(profile.directory, "missing", "profile");
    const store = await import("../../desktop/src/window-chrome-store");
    expect(store.writeWindowChrome({ origin: "https://minddy.example.test", integrated: true })).toBe(false);
    expect(error).toHaveBeenCalledWith("[window-chrome] write failed", expect.any(Error));
  });
});
