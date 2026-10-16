import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchClientRead = vi.hoisted(() => vi.fn());
vi.mock("./client-read", () => ({ fetchClientRead }));

import {
  loadIssuePromptContext,
  loadOneIssuePromptContext,
  PROMPT_CONTEXT_TIMEOUT_MS,
  UNAVAILABLE_FORGE_CONTEXT,
} from "./issue-prompt-context";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("loadIssuePromptContext", () => {
  beforeEach(() => fetchClientRead.mockClear());

  it("reads the batch once, with a short deadline, skipping optimistic ids", async () => {
    fetchClientRead.mockResolvedValue(Response.json({
      issues: { [ID]: { pullRequests: [], repository: null } },
    }));
    const context = await loadIssuePromptContext([ID, "optimistic-1", ID, OTHER]);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
    expect(fetchClientRead.mock.calls[0][0]).toBe(`/api/issues/prompt-context?ids=${ID},${OTHER}`);
    expect(fetchClientRead.mock.calls[0][2]).toEqual({ timeoutMs: PROMPT_CONTEXT_TIMEOUT_MS });
    expect(context.get(ID)).toEqual({ pullRequests: [], repository: null });
    // An issue the server omitted stays unknown, never "no pull request".
    expect(context.has(OTHER)).toBe(false);
  });

  it("makes no request when no id is persisted", async () => {
    expect((await loadIssuePromptContext(["optimistic-1"])).size).toBe(0);
    expect(fetchClientRead).not.toHaveBeenCalled();
  });

  it("degrades to unavailable on an error status, so copying still works", async () => {
    fetchClientRead.mockResolvedValue(new Response("", { status: 500 }));
    expect(await loadOneIssuePromptContext(ID)).toEqual(UNAVAILABLE_FORGE_CONTEXT);
  });

  it("degrades to unavailable on a network failure or timeout", async () => {
    fetchClientRead.mockRejectedValueOnce(new Error("timeout"));
    expect(await loadOneIssuePromptContext(ID)).toEqual(UNAVAILABLE_FORGE_CONTEXT);
  });
});
