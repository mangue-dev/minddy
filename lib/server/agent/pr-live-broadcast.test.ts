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
  it("starts the send at once and hands it to the response lifetime", async () => {
    let release!: () => void;
    h.broadcastToTopic.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    broadcastPrChanged("pr-1", ["pr"]);
    // Started now, so a streamed response does not hold it back…
    expect(h.broadcastToTopic).toHaveBeenCalledWith("pull-request:pr-1", "changed",
      { parts: ["pr"], at: expect.any(Number) });
    // …and registered with `after`, which keeps the invocation alive until it lands.
    expect(h.after).toHaveBeenCalledOnce();
    let settled = false;
    const kept = h.after.mock.calls[0]![0]().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await kept;
    expect(settled).toBe(true);
  });

  it("schedules the send of a webhook resolved by number before returning", async () => {
    h.findPullRequestByNumber.mockResolvedValue({ id: "pr-2" });
    await broadcastPrChangedByNumber({ provider: "github", repoFullName: "acme/app", number: 7, parts: ["pr"] });
    expect(h.after).toHaveBeenCalledOnce();
    expect(h.broadcastToTopic).toHaveBeenCalledWith("pull-request:pr-2", "changed",
      expect.objectContaining({ parts: ["pr"] }));
  });

  it("sends nothing for an empty change", () => {
    broadcastPrChanged("pr-1", []);
    expect(h.after).not.toHaveBeenCalled();
  });
});
