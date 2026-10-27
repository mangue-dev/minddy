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
  profile.directory = await mkdtemp(path.join(os.tmpdir(), "minddy-window-material-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(profile.directory, { recursive: true, force: true });
});

describe("window material store", () => {
  it("keeps the effect on a fresh profile and remembers turning it off", async () => {
    const store = await import("../../desktop/src/window-material-store");
    expect(store.readWindowMaterialEnabled()).toBe(true);
    expect(store.writeWindowMaterialEnabled(false)).toBe(true);
    expect(store.readWindowMaterialEnabled()).toBe(false);
    expect(JSON.parse(await readFile(path.join(profile.directory, "window-material.json"), "utf8")))
      .toEqual({ enabled: false });
  });

  it("keeps the effect when the file is truncated", async () => {
    const store = await import("../../desktop/src/window-material-store");
    await writeFile(path.join(profile.directory, "window-material.json"), '{"enabled":fal');
    expect(store.readWindowMaterialEnabled()).toBe(true);
  });

  it("reports a failed write", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    profile.directory = path.join(profile.directory, "missing", "profile");
    const store = await import("../../desktop/src/window-material-store");
    expect(store.writeWindowMaterialEnabled(false)).toBe(false);
    expect(error).toHaveBeenCalledWith("[window-material] write failed", expect.any(Error));
  });
});
