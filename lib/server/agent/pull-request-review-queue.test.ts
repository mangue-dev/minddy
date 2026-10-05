import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VisibleRepo } from "./pull-requests";
import type { PullRequestRef } from "./pr";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn() }));
vi.mock("./repo-access", () => ({ resolveRepoCloneTargetForRepo: mocks.resolve }));
vi.mock("./forge", () => ({ forgeFor: () => ({ listPullRequests: mocks.list }) }));
import { invalidateReviewQueue, readReviewQueue, rememberReviewQueue } from "./pull-request-review-queue";
const repo = { provider: "github", repoFullName: "acme/app" } as VisibleRepo;
const pull = { number: 1, requestedReviewers: [{ login: "ada", avatar_url: null }] } as PullRequestRef;
beforeEach(() => {
  vi.clearAllMocks();
  invalidateReviewQueue(repo.provider, repo.repoFullName);
  mocks.resolve.mockResolvedValue({ token: "reader" });
  mocks.list.mockResolvedValue({ pulls: [pull], truncated: false });
});
afterEach(() => vi.restoreAllMocks());

it("reuses discovery observations without resolving credentials or scanning again", async () => {
  rememberReviewQueue("owner", repo, [pull]);
  expect(await readReviewQueue("owner", repo)).toEqual(new Map([[1, ["ada"]]]));
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

it("deduplicates concurrent reads but keeps authenticated viewers isolated", async () => {
  const first = readReviewQueue("owner", repo);
  expect(readReviewQueue("owner", repo)).toBe(first);
  await first;
  await readReviewQueue("other", repo);
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
  expect(mocks.list).toHaveBeenCalledTimes(2);
});

it("refreshes expired observations and invalidates all viewers after a review mutation", async () => {
  let now = 100;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  await readReviewQueue("owner", repo);
  now += 60_000;
  await readReviewQueue("owner", repo);
  expect(mocks.list).toHaveBeenCalledTimes(2);
  invalidateReviewQueue(repo.provider, repo.repoFullName);
  await readReviewQueue("owner", repo);
  expect(mocks.list).toHaveBeenCalledTimes(3);
});

it("does not resurrect a stale snapshot when a review changes during an in-flight scan", async () => {
  let release!: (value: { pulls: PullRequestRef[] }) => void;
  mocks.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const first = readReviewQueue("owner", repo);
  await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
  invalidateReviewQueue(repo.provider, repo.repoFullName);
  release({ pulls: [pull] });
  await first;
  mocks.list.mockResolvedValue({ pulls: [], truncated: false });
  expect(await readReviewQueue("owner", repo)).toEqual(new Map());
  expect(mocks.list).toHaveBeenCalledTimes(2);
});

it("releases failures so a later refresh can recover", async () => {
  mocks.list.mockRejectedValueOnce(new Error("Offline"));
  await expect(readReviewQueue("owner", repo)).rejects.toThrow("Offline");
  await expect(readReviewQueue("owner", repo)).resolves.toEqual(new Map([[1, ["ada"]]]));
});
