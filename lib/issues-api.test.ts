import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";
import { updateIssueApi } from "./issues-api";

vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parent relationship analytics through updateIssueApi", () => {
  it.each([
    [null, "issue_relation_removed"],
    ["parent-id", "issue_relation_added"],
  ] as const)("records parent %s as %s after a successful update", async (parentId, event) => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "child-id", parent_id: parentId }));

    await updateIssueApi("child-id", { parent_id: parentId });

    expect(fetchMock).toHaveBeenCalledWith("/api/issues/child-id", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ parent_id: parentId }),
    }));
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(event, { relation: "parent" });
  });

  it.each([{}, { parent_id: undefined }])("does not record a relationship for %j", async (updates) => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "child-id" }));

    await updateIssueApi("child-id", updates);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not record an unlink rejected by the server", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Update rejected" }, { status: 403 }));

    await expect(updateIssueApi("child-id", { parent_id: null })).rejects.toThrow("Update rejected");

    expect(trackEvent).not.toHaveBeenCalled();
  });
});
