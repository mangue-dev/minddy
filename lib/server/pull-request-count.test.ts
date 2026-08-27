import { describe, expect, it, vi } from "vitest";

import { countPullRequestsForUser } from "./agent/pull-requests";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "ACME",
  name: "Acme",
  icon_url: null,
  orb_seed: null,
};

describe("countPullRequestsForUser", () => {
  it("groups repositories by provider and requests exact head-only counts", async () => {
    const calls: Array<{ provider?: string; names?: string[]; states?: string[] }> = [];
    const counts: Record<string, number> = { github: 3, gitlab: 2 };
    const supabase = {
      from: vi.fn(() => {
        const call: { provider?: string; names?: string[]; states?: string[] } = {};
        calls.push(call);
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((_field: string, value: string) => {
            call.provider = value;
            return builder;
          }),
          in: vi.fn((field: string, value: string[]) => {
            if (field === "repo_full_name") call.names = value;
            if (field === "state") call.states = value;
            return builder;
          }),
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ count: counts[call.provider ?? ""] ?? 0, error: null }),
        };
        return builder;
      }),
    };

    const count = await countPullRequestsForUser(
      supabase as never,
      [
        { provider: "github", repoFullName: "acme/web", project },
        { provider: "github", repoFullName: "acme/web", project },
        { provider: "gitlab", repoFullName: "acme/api", project },
      ],
      ["open", "draft"],
    );

    expect(count).toBe(5);
    expect(calls).toEqual([
      { provider: "github", names: ["acme/web"], states: ["open", "draft"] },
      { provider: "gitlab", names: ["acme/api"], states: ["open", "draft"] },
    ]);
  });
});
