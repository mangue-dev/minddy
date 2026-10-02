import { describe, expect, it, vi } from "vitest";
import type { RemoteIssue } from "./issue-sync-core";

const h = vi.hoisted(() => ({ service: vi.fn(), issueStore: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.service }));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: h.issueStore }));

import { applyRemoteIssue } from "./issue-sync";

describe("forge issue sync logs", () => {
  it("does not log a private repository or echoed provider data on lookup failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const query = { select: vi.fn(), is: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: {
        message: "MIN591_PRIVATE_SUBMITTED_ISSUE",
      } })) };
    for (const method of ["select", "is", "eq"] as const) {
      query[method].mockReturnValue(query);
    }
    h.service.mockReturnValue({});
    h.issueStore.mockReturnValue(query);
    const target = { linkId: "link-id", projectId: "project-id",
      provider: "github" as const, connectionId: "connection-id",
      installationId: 1, externalRepoId: "1",
      repoFullName: "MIN591_PRIVATE_REPOSITORY", createdBy: "actor-id" };
    const remote: RemoteIssue = { provider: "github",
      repoFullName: "MIN591_PRIVATE_REPOSITORY", repoId: "1",
      number: 1, title: "MIN591_PRIVATE_TITLE", body: "MIN591_PRIVATE_BODY",
      url: null, action: "edited", actorLogin: null, state: "open",
      labels: [], assigneeLogins: [] };
    await applyRemoteIssue(target, remote);
    expect(JSON.stringify(log.mock.calls)).not.toContain("MIN591_PRIVATE");
    expect(log).toHaveBeenCalledWith("[issue-sync] issue_lookup_failed");
    log.mockRestore();
  });
});
