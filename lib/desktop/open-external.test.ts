import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openExternal: vi.fn() }));
vi.mock("../../desktop/node_modules/electron", () => ({ shell: mocks }));

import { openDesktopExternal } from "../../desktop/src/open-external";

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

it("launches accepted links without changing their destination", async () => {
  mocks.openExternal.mockResolvedValue(undefined);
  const url = "https://minddy.example/feedback?token=private";
  await expect(openDesktopExternal(url)).resolves.toBe(true);
  expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith(url);
});

it("contains missing protocol-handler failures without logging private URL data", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.openExternal.mockRejectedValue(new Error("Could not open https://minddy.example/?token=private"));
  await expect(openDesktopExternal("https://minddy.example/?token=private")).resolves.toBe(false);
  expect(log).toHaveBeenCalledExactlyOnceWith("[desktop] external_open_failed");
});

it("contains synchronous launcher failures and permits the next browser attempt", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.openExternal.mockImplementationOnce(() => { throw new Error("Browser unavailable"); });
  await expect(openDesktopExternal("https://minddy.example")).resolves.toBe(false);
  mocks.openExternal.mockResolvedValue(undefined);
  await expect(openDesktopExternal("https://minddy.example/login")).resolves.toBe(true);
  expect(mocks.openExternal).toHaveBeenCalledTimes(2);
});
