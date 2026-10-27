import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  after: vi.fn<(work: () => Promise<void>) => void>(),
  broadcastToTopic: vi.fn(async () => {}),
  findPullRequestByNumber: vi.fn(),
}));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("./live", () => ({ broadcastToTopic: h.broadcastToTopic }));
vi.mock("./pull-requests", () => ({ findPullRequestByNumber: h.findPullRequestByNumber }));

const { broadcastPrChanged, broadcastPrChangedByNumber } = await import("./pr-live");

beforeEach(() => vi.clearAllMocks());

describe("pull request live broadcast lifetime (MIN-817)", () => {
  it("hands the send to the response lifetime instead of detaching it", async () => {
    broadcastPrChanged("pr-1", ["pr"]);
    // Registered with `after`, so the platform keeps the invocation alive.
    expect(h.after).toHaveBeenCalledOnce();
    expect(h.broadcastToTopic).not.toHaveBeenCalled();
    await h.after.mock.calls[0]![0]();
    expect(h.broadcastToTopic).toHaveBeenCalledWith("pull-request:pr-1", "changed",
      { parts: ["pr"], at: expect.any(Number) });
  });

  it("schedules the send of a webhook resolved by number before returning", async () => {
    h.findPullRequestByNumber.mockResolvedValue({ id: "pr-2" });
    await broadcastPrChangedByNumber({ provider: "github", repoFullName: "acme/app", number: 7, parts: ["pr"] });
    expect(h.after).toHaveBeenCalledOnce();
    await h.after.mock.calls[0]![0]();
    expect(h.broadcastToTopic).toHaveBeenCalledWith("pull-request:pr-2", "changed",
      expect.objectContaining({ parts: ["pr"] }));
  });

  it("sends nothing for an empty change", () => {
    broadcastPrChanged("pr-1", []);
    expect(h.after).not.toHaveBeenCalled();
  });
});
