import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), sync: vi.fn(), stamp: vi.fn() }));
vi.mock("./repo-access", () => ({ resolveRepoCloneTargetForRepo: mocks.resolve }));
vi.mock("./pull-requests", () => ({ stampRepoSync: mocks.stamp, syncRepoPullRequests: mocks.sync }));
import { sweepRepo } from "./pull-requests-sweep";
import type { VisibleRepo } from "./pull-requests";
const repo = { provider: "github", repoFullName: "acme/app" } as VisibleRepo;
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ token: "reader" }); });

it("joins concurrent list and badge sweeps but starts a new read after settlement", async () => {
  let release!: (result: { truncated: boolean }) => void;
  mocks.sync.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const first = sweepRepo("owner", repo);
  const second = sweepRepo("owner", repo);
  expect(second).toBe(first);
  await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
  release({ truncated: true });
  expect(await first).toBe(true);
  mocks.sync.mockResolvedValue({ truncated: false });
  expect(await sweepRepo("owner", repo)).toBe(false);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
});

it("does not share another reader's authorized operation", async () => {
  mocks.sync.mockResolvedValue({ truncated: false });
  await Promise.all([sweepRepo("owner", repo), sweepRepo("other", repo)]);
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
});

it("releases failed operations and stamps the failure backoff", async () => {
  mocks.sync.mockRejectedValue(new Error("Offline"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await sweepRepo("owner", repo)).toBe(false);
    expect(mocks.stamp).toHaveBeenCalledWith("github", "acme/app");
    mocks.sync.mockResolvedValue({ truncated: false });
    await sweepRepo("owner", repo);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  } finally { log.mockRestore(); }
});

it("rereads only the window since the previous sweep, without overwriting the review queue", async () => {
  mocks.sync.mockResolvedValue({ truncated: false });
  await sweepRepo("owner", repo, {
    provider: "github", repo_full_name: "acme/app", synced_at: "2026-11-02T12:00:00.000Z", truncated: true,
  });
  expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({
    updatedSince: "2026-11-02T11:00:00.000Z",
    onObserved: undefined,
  }));
});

it("scans the whole history of a repository never swept", async () => {
  mocks.sync.mockResolvedValue({ truncated: false });
  await sweepRepo("owner", repo);
  const [opts] = mocks.sync.mock.calls[0];
  expect(opts.updatedSince).toBeUndefined();
  expect(opts.onObserved).toEqual(expect.any(Function));
});
