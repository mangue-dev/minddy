import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/git/repository-name-content", () => ({
  repositoryStorageName: async (_provider: string, name: string) => name,
  decodeRepositoryName: async (_provider: string, name: string) => name,
}));
vi.mock("./pull-request-url-content", () => ({
  shouldEncryptPullRequestUrl: () => false,
  decodePullRequestUrlRow: async (row: unknown) => row,
}));
vi.mock("./pull-request-content", () => ({
  shouldEncryptPullRequestContent: () => false,
  decodePullRequestContentRow: async (row: unknown) => row,
}));
import { upsertPullRequestWithOutcome } from "./pull-requests";

const input = { provider: "github" as const, repoFullName: "example/repo", number: 1, state: "open" as const };
const row = { id: "pr", provider: "github", repo_full_name: "example/repo", number: 1, state: "open" };
const changed = { data: null, error: { code: "40001", message: "pull_request_issue_links_changed" } };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("pull request observation retries", () => {
  it("retries a concurrent association change with the same observation", async () => {
    mocks.rpc.mockResolvedValueOnce(changed)
      .mockResolvedValueOnce({ data: { row, applied: true }, error: null });
    expect(await upsertPullRequestWithOutcome(input)).toEqual({ row, applied: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
  });

  it("bounds retries when the association set keeps changing", async () => {
    mocks.rpc.mockResolvedValue(changed);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await upsertPullRequestWithOutcome(input)).toBeNull();
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });

  it("does not retry an unrelated database error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "Invalid reference" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await upsertPullRequestWithOutcome(input)).toBeNull();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
