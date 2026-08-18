import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-330 — which can make a project owner spend writing
 * `@numo` on a pull request.
 *
 * The subject of the file is a REFUSAL, not a feature: what we check
 * first, is that no replay starts. `startNumoPrReview` is therefore the
 * central witness — if it is called, the attack succeeded.
 *
 * The fake Supabase carries the five requests of the path (the ticket, the links of
 * repository, the owner, the members, the forge identities) and the counter of debit
 * `claim_forge_mention`, which it REALLY implements: the window and the rank rendered
 * are what decides the refusal and the only refusal comment, a false one which
 * would always return 1 would say nothing.
 */

const REPO = "mangue-dev/minddy";
const PROJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const PR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const world = {
  /** forge login → minddy user who connected this account. */
  identities: [] as Array<{ user_id: string; account_login: string; provider: string }>,
  members: [] as string[],
  links: [{ provider: "github", repo_full_name: REPO, project_id: PROJECT_ID }],
  /** The persisted counter, as rendered by the SQL function. */
  counters: new Map<string, number>(),
  rpcFails: false,
};

vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inValues: string[] | null = null;

    const rows = (): unknown[] => {
      if (table === "issues") return [];
      if (table === "project_git_links") {
        return world.links
          .filter(
            (l) =>
              l.provider === filters.provider &&
              l.repo_full_name === filters.repo_full_name,
          )
          .map((l) => ({
            project_id: l.project_id,
            created_at: "2026-01-01T00:00:00Z",
            projects: { owner_id: OWNER_ID },
          }));
      }
      if (table === "projects") return [{ owner_id: OWNER_ID }];
      if (table === "project_members") {
        return world.members.map((user_id) => ({ user_id, project_id: PROJECT_ID }));
      }
      if (table === "git_user_identities" || table === "git_connections") {
        return world.identities
          .filter((i) => i.provider === filters.provider)
          .filter((i) => !inValues || inValues.includes(i.user_id))
          .map((i) => ({ user_id: i.user_id, account_login: i.account_login }));
      }
      return [];
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (_column: string, values: string[]) => {
        inValues = values;
        return builder;
      },
      order: () => Promise.resolve({ data: rows(), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows(), error: null }),
    };
    return builder;
  };

  const rpc = (_name: string, args: { p_key: string }) => {
    if (world.rpcFails) {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    }
    const next = (world.counters.get(args.p_key) ?? 0) + 1;
    world.counters.set(args.p_key, next);
    return Promise.resolve({ data: next, error: null });
  };

  return { getServiceClient: () => ({ from, rpc }) };
});

vi.mock("@/lib/server/assistant/comment-agent", () => ({
  mentionsNumo: (body: string) => /@numo\b/i.test(body),
}));

vi.mock("./pull-requests", () => ({
  findPullRequestByNumber: vi.fn(async () => ({
    id: PR_ID,
    provider: "github",
    repo_full_name: REPO,
    number: 42,
    issue_id: null,
    state: "open",
  })),
}));

const createPullRequestComment = vi.fn(async (_opts: { body: string }) => ({
  id: 1,
  html_url: "u",
}));
const startNumoPrReview = vi.fn(async (_input: { userId: string }) => null);

vi.mock("./pr-actions", () => ({
  resolvePrScope: vi.fn(async () => ({
    forge: { createPullRequestComment },
    call: { token: "t", repoFullName: REPO, number: 42 },
  })),
  startNumoPrReview,
}));

const { handleForgeNumoMention } = await import("./pr-mention");
const { MENTION_LIMIT_PER_AUTHOR } = await import("./forge-mention-guard");

function mention(login: string | null, body = "@numo peux-tu relire ?") {
  return handleForgeNumoMention({
    provider: "github",
    repoFullName: REPO,
    prNumber: 42,
    body,
    authorLogin: login,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  world.identities = [
    { user_id: OWNER_ID, account_login: "clement", provider: "github" },
    { user_id: MEMBER_ID, account_login: "collegue", provider: "github" },
  ];
  world.members = [MEMBER_ID];
  world.counters.clear();
  world.rpcFails = false;
});

describe("handleForgeNumoMention — qui a le droit", () => {
  it("ne lance rien pour un auteur qu'aucun membre n'a connecté", async () => {
    await mention("inconnu");
    expect(startNumoPrReview).not.toHaveBeenCalled();
  });

  it("ne lance rien pour un commentaire sans auteur", async () => {
    await mention(null);
    expect(startNumoPrReview).not.toHaveBeenCalled();
  });

  it("ne lance rien pour un compte de forge connu mais étranger au projet", async () => {
    world.members = [];
    world.identities.push({
      user_id: "33333333-3333-4333-8333-333333333333",
      account_login: "etranger",
      provider: "github",
    });
    await mention("etranger");
    expect(startNumoPrReview).not.toHaveBeenCalled();
  });

  it("répond UNE fois au non-membre, puis se tait", async () => {
    await mention("inconnu");
    expect(createPullRequestComment).toHaveBeenCalledTimes(1);
    const body = createPullRequestComment.mock.calls[0][0].body;
    expect(body).toContain("@inconnu");

    await mention("inconnu");
    await mention("inconnu");
    expect(createPullRequestComment).toHaveBeenCalledTimes(1);
    expect(startNumoPrReview).not.toHaveBeenCalled();
  });

  it("laisse passer un membre du projet, et le propriétaire", async () => {
    await mention("collegue");
    expect(startNumoPrReview).toHaveBeenCalledTimes(1);
    await mention("Clement");
    expect(startNumoPrReview).toHaveBeenCalledTimes(2);
    expect(createPullRequestComment).not.toHaveBeenCalled();
  });

  it("impute la relecture au OWNER du projet, jamais à l'auteur du commentaire", async () => {
    await mention("collegue");
    expect(startNumoPrReview.mock.calls[0][0].userId).toBe(OWNER_ID);
  });
});

describe("handleForgeNumoMention — combien de fois", () => {
  it("refuse le déclenchement au-delà de la limite horaire, et le dit une fois", async () => {
    for (let i = 0; i < MENTION_LIMIT_PER_AUTHOR; i++) await mention("collegue");
    expect(startNumoPrReview).toHaveBeenCalledTimes(MENTION_LIMIT_PER_AUTHOR);
    expect(createPullRequestComment).not.toHaveBeenCalled();

    await mention("collegue");
    expect(startNumoPrReview).toHaveBeenCalledTimes(MENTION_LIMIT_PER_AUTHOR);
    expect(createPullRequestComment).toHaveBeenCalledTimes(1);

    await mention("collegue");
    expect(startNumoPrReview).toHaveBeenCalledTimes(MENTION_LIMIT_PER_AUTHOR);
    expect(createPullRequestComment).toHaveBeenCalledTimes(1);
  });

  it("ne laisse pas un inconnu consommer le compteur des membres", async () => {
    for (let i = 0; i < 50; i++) await mention("inconnu");
    await mention("collegue");
    expect(startNumoPrReview).toHaveBeenCalledTimes(1);
  });

  it("refuse quand le compteur persisté est indisponible (fail-closed)", async () => {
    world.rpcFails = true;
    await mention("collegue");
    expect(startNumoPrReview).not.toHaveBeenCalled();
  });
});
