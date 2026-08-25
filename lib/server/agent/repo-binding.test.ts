import { describe, expect, it } from "vitest";

import { repoBindingMatchesRun, type RunRepoBinding } from "./runs";

const current = {
  id: "link-1",
  connection_id: "connection-1",
  provider: "github",
  external_repo_id: "9001",
};

const linkedRun: RunRepoBinding = {
  repo_link_id: current.id,
  connection_id: current.connection_id,
  repo_provider: "github",
  repo_external_id: current.external_repo_id,
};

describe("run repository binding", () => {
  it("matches only the complete stable repository identity", () => {
    expect(repoBindingMatchesRun(linkedRun, current)).toBe(true);
    expect(repoBindingMatchesRun(linkedRun, { ...current, external_repo_id: "9002" })).toBe(false);
    expect(repoBindingMatchesRun(linkedRun, null)).toBe(false);
  });

  it("distinguishes a run launched without a repository from a deleted link", () => {
    expect(
      repoBindingMatchesRun(
        {
          repo_link_id: null,
          connection_id: null,
          repo_provider: null,
          repo_external_id: null,
        },
        null,
      ),
    ).toBe(true);
    expect(
      repoBindingMatchesRun(
        { ...linkedRun, repo_link_id: null, connection_id: null },
        null,
      ),
    ).toBe(false);
  });
});
