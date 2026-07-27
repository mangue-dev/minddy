import { describe, expect, it } from "vitest";
import {
  AGENT_BRANCH_PREFIX,
  isDeletableAgentBranch,
  selectStaleBranches,
} from "./branch-cleanup-core";
import type { PullRequestRef } from "@/lib/server/agent/pr";

// La partie PURE du ménage des branches d'agent (MIN-102) — la partie qui parle
// à la base et à la forge vit dans branch-cleanup.ts et n'est pas testable en
// node (server-only).

const DEFAULT_BRANCH = "main";

/** PR minimale : seuls `head`, l'état et le numéro comptent ici. */
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
  head: `${AGENT_BRANCH_PREFIX}min-42-abcd1234`,
  merged: true,
  createdAt: "2026-07-01T10:00:00Z",
});
const rejected = pull({
  number: 2,
  head: `${AGENT_BRANCH_PREFIX}min-43-beef5678`,
  createdAt: "2026-07-02T10:00:00Z",
});

const allKnown = new Set([merged.head!, rejected.head!]);

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

describe("selectStaleBranches", () => {
  const select = (pulls: PullRequestRef[], known: Set<string> = allKnown) =>
    selectStaleBranches({ pulls, knownBranches: known, defaultBranch: DEFAULT_BRANCH });

  it("retient une branche de PR fusionnée", () => {
    const [only] = select([merged]);
    expect(only).toMatchObject({ branch: merged.head, prState: "merged", prNumber: 1 });
  });

  it("retient aussi une branche de PR refusée", () => {
    const [only] = select([rejected]);
    expect(only).toMatchObject({ branch: rejected.head, prState: "closed", prNumber: 2 });
  });

  it("écarte une branche qui porte AUSSI une PR ouverte", () => {
    const reopened = pull({ number: 3, head: merged.head, state: "open" });
    expect(select([merged, reopened])).toEqual([]);
  });

  it("écarte une branche qui porte une PR draft", () => {
    const draft = pull({ number: 4, head: rejected.head, state: "open", draft: true });
    expect(select([rejected, draft])).toEqual([]);
  });

  it("écarte une branche hors du préfixe d'agent, PR fermée ou non", () => {
    const human = pull({ number: 5, head: "feature/login", merged: true });
    expect(select([human], new Set(["feature/login"]))).toEqual([]);
  });

  it("écarte la branche par défaut du dépôt", () => {
    const onDefault = pull({ number: 6, head: DEFAULT_BRANCH, merged: true });
    expect(select([onDefault], new Set([DEFAULT_BRANCH]))).toEqual([]);
  });

  it("écarte une branche qu'aucun run d'agent n'a enregistrée", () => {
    expect(select([merged], new Set())).toEqual([]);
  });

  it("ne rend qu'une ligne pour deux PR fermées sur la même branche", () => {
    const older = pull({
      number: 7,
      head: merged.head,
      createdAt: "2026-06-01T10:00:00Z",
    });
    const result = select([merged, older]);
    expect(result).toHaveLength(1);
    // La plus RÉCENTE porte l'état affiché : ici la fusionnée.
    expect(result[0]).toMatchObject({ prNumber: 1, prState: "merged" });
  });

  it("range les fusionnées avant les refusées", () => {
    expect(select([rejected, merged]).map((b) => b.prState)).toEqual([
      "merged",
      "closed",
    ]);
  });
});
