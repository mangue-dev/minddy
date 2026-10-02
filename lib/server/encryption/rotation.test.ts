import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), rotate: vi.fn(), mark: vi.fn() }));
vi.mock("./registry", () => ({
  listDueContentKeys: mocks.list,
  getContentKeys: () => ({ rotate: mocks.rotate }),
  markContentKeyRotationAttempt: mocks.mark,
}));
const { rotateDueContentKeys } = await import("./rotation");

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("automatic content key rotation", () => {
  it("rotates due scopes against the version selected by the bounded scan", async () => {
    const scope = { kind: "user", id: "user-1" };
    mocks.list.mockResolvedValue([{ scope, version: 3 }]);
    mocks.rotate.mockResolvedValue(4);
    const now = Date.UTC(2026, 8, 23);
    expect(await rotateDueContentKeys(10, now)).toEqual({ scanned: 1, advanced: 1, failed: 0 });
    expect(mocks.list).toHaveBeenCalledWith(new Date(now - 90 * 86_400_000).toISOString(), 10);
    expect(mocks.rotate).toHaveBeenCalledWith(scope, 3);
    expect(mocks.mark).toHaveBeenCalledWith({ scope, version: 3 }, new Date(now).toISOString());
    expect(mocks.mark.mock.invocationCallOrder[0]).toBeLessThan(mocks.rotate.mock.invocationCallOrder[0]);
  });

  it("continues other tenants after an unavailable key without logging key material", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.list.mockResolvedValue([
      { scope: { kind: "project", id: "project-1" }, version: 1 },
      { scope: { kind: "user", id: "user-1" }, version: 1 },
    ]);
    mocks.rotate.mockRejectedValueOnce(new Error("sensitive provider detail")).mockResolvedValueOnce(2);
    expect(await rotateDueContentKeys()).toEqual({ scanned: 2, advanced: 1, failed: 1 });
    expect(mocks.rotate).toHaveBeenCalledTimes(2);
    expect(mocks.mark).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive provider detail");
  });

  it("rejects unbounded scans", async () => {
    await expect(rotateDueContentKeys(101)).rejects.toThrow("rotation batch");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
