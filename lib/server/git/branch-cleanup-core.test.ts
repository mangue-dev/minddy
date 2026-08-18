import { describe, expect, it } from "vitest";
import {
  AGENT_BRANCH_PREFIX,
  isBranchInUse,
  isDeletableAgentBranch,
  selectAgentBranches,
} from "./branch-cleanup-core";
import type { PullRequestRef } from "@/lib/server/agent/pr";

// The PURE part of agent branch management (MIN-102) — the part that
// talks to base and forge lives in branch-cleanup.ts and is not testable
// en node (server-only).

const DEFAULT_BRANCH = "main";

const MERGED_BRANCH = `${AGENT_BRANCH_PREFIX}min-42-abcd1234`;
const REJECTED_BRANCH = `${AGENT_BRANCH_PREFIX}min-43-beef5678`;
const BARE_BRANCH = `${AGENT_BRANCH_PREFIX}min-44-cafe9012`;

/** Minimum PR: only `head`, state and number matter here. */
function pull(over: Partial<PullRequestRef> & { number: number }): PullRequestRef {
  return {
    url: `https://github.com/acme/app/pull/${over.number}`,
    state: "closed",
    merged: false,
    createdAt: "2026-07-01T10:00:00Z",
    ...over,
  };
}

const merged = pull({
  number: 1,
  head: MERGED_BRANCH,
  merged: true,
  createdAt: "2026-07-01T10:00:00Z",
});
const rejected = pull({
  number: 2,
  head: REJECTED_BRANCH,
  createdAt: "2026-07-02T10:00:00Z",
});

/** The three agent branches, as `agent_runs` registered them. */
const ALL_KNOWN = [MERGED_BRANCH, REJECTED_BRANCH, BARE_BRANCH];
const ALL_REMOTE = new Set(ALL_KNOWN);

describe("isDeletableAgentBranch", () => {
  it("accepte une branche d'agent ordinaire", () => {
    expect(isDeletableAgentBranch(`${AGENT_BRANCH_PREFIX}min-1-abcd`, DEFAULT_BRANCH)).toBe(
      true,
    );
  });

  it("refuse tout ce qui sort du préfixe d'agent", () => {
    expect(isDeletableAgentBranch("feature/login", DEFAULT_BRANCH)).toBe(false);
    expect(isDeletableAgentBranch("minddy/manual", DEFAULT_BRANCH)).toBe(false);
    expect(isDeletableAgentBranch(AGENT_BRANCH_PREFIX, DEFAULT_BRANCH)).toBe(false);
  });

  it("refuse la branche par défaut, même préfixée", () => {
    expect(
      isDeletableAgentBranch(`${AGENT_BRANCH_PREFIX}main`, `${AGENT_BRANCH_PREFIX}main`),
    ).toBe(false);
  });

  it("refuse ce qui pourrait sortir du ref une fois dans l'URL", () => {
    expect(isDeletableAgentBranch(`${AGENT_BRANCH_PREFIX}../main`, DEFAULT_BRANCH)).toBe(
      false,
    );
    expect(isDeletableAgentBranch(`${AGENT_BRANCH_PREFIX}min 42`, DEFAULT_BRANCH)).toBe(
      false,
    );
  });
});

describe("isBranchInUse", () => {
  it("ne compte comme « en cours d'usage » que PR ouverte et sans PR", () => {
    expect(isBranchInUse("open")).toBe(true);
    expect(isBranchInUse("none")).toBe(true);
    expect(isBranchInUse("merged")).toBe(false);
    expect(isBranchInUse("closed")).toBe(false);
  });
});

describe("selectAgentBranches", () => {
  const select = (
    pulls: PullRequestRef[],
    known: string[] = ALL_KNOWN,
    remote: Set<string> = ALL_REMOTE,
  ) =>
    selectAgentBranches({
      pulls,
      knownBranches: known,
      remoteBranches: remote,
      defaultBranch: DEFAULT_BRANCH,
    });

  it("classe une branche de PR fusionnée", () => {
    const [only] = select([merged], [MERGED_BRANCH]);
    expect(only).toMatchObject({ branch: MERGED_BRANCH, state: "merged", prNumber: 1 });
  });

  it("classe une branche de PR refusée", () => {
    const [only] = select([rejected], [REJECTED_BRANCH]);
    expect(only).toMatchObject({ branch: REJECTED_BRANCH, state: "closed", prNumber: 2 });
  });

  it("garde la branche SANS aucune PR, sans référence de PR", () => {
    const [only] = select([], [BARE_BRANCH]);
    expect(only).toMatchObject({
      branch: BARE_BRANCH,
      state: "none",
      prNumber: null,
      prUrl: null,
      prCreatedAt: null,
    });
  });

  it("classe `open` une branche dont la PR est ouverte, au lieu de l'écarter", () => {
    const open = pull({ number: 3, head: BARE_BRANCH, state: "open" });
    const [only] = select([open], [BARE_BRANCH]);
    expect(only).toMatchObject({ branch: BARE_BRANCH, state: "open", prNumber: 3 });
  });

  it("classe `open` une branche dont la PR est un brouillon", () => {
    const draft = pull({ number: 4, head: BARE_BRANCH, state: "open", draft: true });
    expect(select([draft], [BARE_BRANCH])[0]).toMatchObject({ state: "open" });
  });

  it("fait primer une PR rouverte sur la PR fermée de la même branche", () => {
    const reopened = pull({ number: 5, head: MERGED_BRANCH, state: "open" });
    const [only] = select([merged, reopened], [MERGED_BRANCH]);
    expect(only).toMatchObject({ state: "open", prNumber: 5 });
  });

  it("écarte une branche qui n'existe plus sur le dépôt", () => {
    expect(select([merged], [MERGED_BRANCH], new Set())).toEqual([]);
  });

  it("écarte une branche hors du préfixe d'agent, PR ou non", () => {
    const human = pull({ number: 6, head: "feature/login", merged: true });
    expect(select([human], ["feature/login"], new Set(["feature/login"]))).toEqual([]);
  });

  it("écarte la branche par défaut du dépôt", () => {
    const onDefault = pull({ number: 7, head: DEFAULT_BRANCH, merged: true });
    expect(
      select([onDefault], [DEFAULT_BRANCH], new Set([DEFAULT_BRANCH])),
    ).toEqual([]);
  });

  it("écarte une branche qu'aucun run d'agent n'a enregistrée", () => {
    expect(select([merged], [])).toEqual([]);
  });

  it("ne rend qu'une ligne pour deux PR fermées sur la même branche", () => {
    const older = pull({
      number: 8,
      head: MERGED_BRANCH,
      createdAt: "2026-06-01T10:00:00Z",
    });
    const result = select([merged, older], [MERGED_BRANCH]);
    expect(result).toHaveLength(1);
    // The most RECENT has the displayed state: here the merged one.
    expect(result[0]).toMatchObject({ prNumber: 1, state: "merged" });
  });

  it("range du plus sûr au plus risqué : fusionnée, refusée, ouverte, sans PR", () => {
    const open = pull({ number: 9, head: BARE_BRANCH, state: "open" });
    const orphan = `${AGENT_BRANCH_PREFIX}min-45-dead0001`;
    const known = [orphan, ...ALL_KNOWN];
    const remote = new Set(known);
    expect(select([rejected, open, merged], known, remote).map((b) => b.state)).toEqual([
      "merged",
      "closed",
      "open",
      "none",
    ]);
  });

  it("laisse les branches sans PR dans l'ordre reçu (run le plus récent d'abord)", () => {
    const a = `${AGENT_BRANCH_PREFIX}min-50-aaaa0000`;
    const b = `${AGENT_BRANCH_PREFIX}min-51-bbbb0000`;
    const known = [a, b];
    expect(select([], known, new Set(known)).map((x) => x.branch)).toEqual([a, b]);
  });
});
