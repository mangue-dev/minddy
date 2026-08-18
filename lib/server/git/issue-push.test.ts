import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssueIdentity } from "@/lib/server/git/issue-push";

/**
 * `scheduleRemoteStatusPush` — the UP half of the sync: the status of a
 * ticket minddy closes (or reopens) the issue it came from.
 *
 * This is the only place in the issue sync that WRITEs to a third party, and on
 * someone's account. Three properties deserve to be pinned for this
 * reason, not for the cover:
 *
 * 1. **Silence by default.** Almost all tickets are born in
 * minddy and have no remote identity: the hook must exit without
 * THE LEAST query. A guard that would relax would make a round trip
 * network for each card move, for nothing.
 * 2. **The toggle cuts both directions.** Cutting the import must cut the return:
 * it would be incomprehensible if a single switch only stopped one —
 * and the user who cuts would believe to have cut.
 * 3. **What we really write.** `done` is a purple “completed” check mark,
 * `canceled` a gray “not planned” circle. This is the only nuance of our
 * three closed statuses that survives traversal, and it plays on a
 * field in the request body.
 *
 * The module is best-effort from start to finish: nothing that fails here should be traced back to the one that failed. moved the card.
 */

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
/** Outgoing HTTP calls, in order — probe this entire file. */
let calls: { url: string; method: string; body: Record<string, unknown>; auth: string }[] =
  [];
/** Scheduled background jobs to wait for explicitly. */
let background: Promise<unknown>[] = [];
/** What `resolveForgeActor` renders — the human actor and their right to the deposit. */
let actor: { kind: "actor"; token: string; capability: string } | { kind: "none" } = {
  kind: "none",
};
/** Response from the forge: `null` = 200, otherwise the error code to return. */
let httpError: number | null = null;

function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.maybeSingle = async () => ({
    data: rows().filter((row) => filters.every((f) => f(row)))[0] ?? null,
    error: null,
  });
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => table(() => linkRows) }),
}));

// The background hook executes immediately AND returns its promise to the test: without
// that, the assertions would run in front of the work they observe.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => Promise<void>) => {
    background.push(work().catch(() => {}));
  },
}));

vi.mock("@/lib/server/git/forge-actor", () => ({
  resolveForgeActor: async () => actor,
}));
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationToken: async () => ({ token: "app-token" }),
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-connection-token",
}));

const { scheduleRemoteStatusPush } = await import("@/lib/server/git/issue-push");

const PROJECT = "project-1";

/** An active binding, such as `project_git_links` carries it. */
function link(overrides: Row = {}): void {
  linkRows.push({
    project_id: PROJECT,
    provider: "github",
    connection_id: "conn-1",
    installation_id: 42,
    repo_full_name: "acme/app",
    external_repo_id: "9001",
    issue_sync_enabled: true,
    ...overrides,
  });
}

/** The ticket imported from a repository — one that has a remote identity. */
const IMPORTED: RemoteIssueIdentity = {
  projectId: PROJECT,
  provider: "github",
  repoId: "9001",
  number: 7,
};

/** Schedule the repercussion and WAIT for the background work it has done. */
async function push(issue: RemoteIssueIdentity, status: string): Promise<void> {
  scheduleRemoteStatusPush({
    issue,
    status: status as never,
    actorId: "user-1",
  });
  await Promise.all(background);
}

beforeEach(() => {
  linkRows = [];
  calls = [];
  background = [];
  actor = { kind: "none" };
  httpError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? "GET",
      body: JSON.parse(String(init.body ?? "{}")),
      auth: headers.Authorization,
    });
    return httpError
      ? {
          ok: false,
          status: httpError,
          json: async () => ({ message: "Resource not accessible by integration" }),
        }
      : { ok: true, status: 200, json: async () => ({}) };
  });
});

describe("scheduleRemoteStatusPush — quand il ne se passe RIEN", () => {
  it("returns without a request for a ticket born in minddy", async () => {
    link();
    await push({ ...IMPORTED, provider: null, repoId: null, number: null }, "done");

    expect(calls).toHaveLength(0);
  });

  it("does not push when sync is disabled — the toggle stops BOTH directions", async () => {
    link({ issue_sync_enabled: false });
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(0);
  });

  it("does not push to a repository that this project has not linked", async () => {
    link({ external_repo_id: "un-autre-depot" });
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(0);
  });
});

describe("scheduleRemoteStatusPush — GitHub", () => {
  beforeEach(() => link());

  it("closes as « completed » for completed work", async () => {
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://api.github.com/repos/acme/app/issues/7");
    expect(calls[0].body).toEqual({ state: "closed", state_reason: "completed" });
  });

  it("closes as « not planned » for work that will not happen", async () => {
    await push(IMPORTED, "canceled");
    await push(IMPORTED, "duplicate");

    expect(calls.map((c) => c.body.state_reason)).toEqual(["not_planned", "not_planned"]);
  });

  it("rouvre sans raison de fermeture — `state_reason` n'a de sens qu'à la fermeture", async () => {
    await push(IMPORTED, "in_progress");

    expect(calls[0].body).toEqual({ state: "open" });
  });

  it("signs with the human's account when it can write to the repository", async () => {
    actor = { kind: "actor", token: "human-token", capability: "write" };
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer human-token");
  });

  it("falls back to the App when the human has only READ access — not a 403 in their name", async () => {
    actor = { kind: "actor", token: "human-token", capability: "read" };
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer app-token");
  });

  it("falls back to the App when nobody has connected an account", async () => {
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer app-token");
  });

  it("swallows a forge rejection — moving a card must never fail", async () => {
    httpError = 403; // “Resource not accessible by integration”: Issues (Write) refused.
    await expect(push(IMPORTED, "done")).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});

describe("scheduleRemoteStatusPush — GitLab", () => {
  beforeEach(() => link({ provider: "gitlab", installation_id: null }));

  const GITLAB_ISSUE: RemoteIssueIdentity = { ...IMPORTED, provider: "gitlab" };

  it("sends a TRANSITION, not a state — GitLab accepts only `state_event`", async () => {
    await push(GITLAB_ISSUE, "done");

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://gitlab.com/api/v4/projects/9001/issues/7");
    expect(calls[0].body).toEqual({ state_event: "close" });
  });

  it("closes the same way for the three closed statuses — no equivalent of `state_reason`", async () => {
    await push(GITLAB_ISSUE, "done");
    await push(GITLAB_ISSUE, "canceled");

    expect(calls.map((c) => c.body)).toEqual([
      { state_event: "close" },
      { state_event: "close" },
    ]);
  });

  it("rouvre depuis n'importe quel statut ouvert", async () => {
    await push(GITLAB_ISSUE, "triage");

    expect(calls[0].body).toEqual({ state_event: "reopen" });
  });

  it("signs with the linker's connection when there is no App", async () => {
    await push(GITLAB_ISSUE, "done");

    expect(calls[0].auth).toBe("Bearer gitlab-connection-token");
  });
});
