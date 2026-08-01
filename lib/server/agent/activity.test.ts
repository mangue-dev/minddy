import { describe, expect, it } from "vitest";
import { buildAgentActivity, type AgentRunRow, type IssuePrRow } from "./activity";

/**
 * Sémantique de l'activité par issue (modèle CONVERSATIONNEL). Le point sensible :
 * `session` veut dire « une CONVERSATION existe » (au travail OU au repos) — c'est
 * ce qui décide si la carte propose d'OUVRIR la conversation ou d'en LANCER une
 * nouvelle. S'il régresse, une issue dont la session est au repos retomberait sur
 * un composer vierge au lieu de poursuivre sa conversation. `working` reste, lui,
 * strictement queued/running (halo animé, un seul agent au travail par ticket).
 * NB : les endpoints appelants excluent déjà les runs `failed` des rows.
 */

function row(over: Partial<AgentRunRow> & { status: string }): AgentRunRow {
  return {
    issue_id: "issue-1",
    id: "run-1",
    pr_number: null,
    pr_state: null,
    created_at: "2026-07-15T10:00:00Z",
    ...over,
  };
}

describe("buildAgentActivity", () => {
  it("une session au repos (completed) reste une conversation ouvrable", () => {
    const out = buildAgentActivity([row({ status: "completed" })]);
    expect(out.sessionIssueIds).toEqual(["issue-1"]);
    expect(out.workingIssueIds).toEqual([]);
  });

  it("compte les sessions au travail comme au repos", () => {
    for (const status of ["queued", "running", "completed", "canceled"]) {
      const out = buildAgentActivity([row({ status })]);
      expect(out.sessionIssueIds, status).toEqual(["issue-1"]);
    }
  });

  it("ne signale « travaille » que pour queued/running", () => {
    expect(buildAgentActivity([row({ status: "completed" })]).workingIssueIds).toEqual([]);
    expect(buildAgentActivity([row({ status: "canceled" })]).workingIssueIds).toEqual([]);
    expect(buildAgentActivity([row({ status: "queued" })]).workingIssueIds).toEqual(["issue-1"]);
    expect(buildAgentActivity([row({ status: "running" })]).workingIssueIds).toEqual(["issue-1"]);
  });

  it("une run active plus ancienne fait travailler l'issue même sous une run terminée", () => {
    // Cas réel : plusieurs runs successives, triées created_at DESC par l'appelant.
    const out = buildAgentActivity([
      row({ id: "run-2", status: "completed", created_at: "2026-07-15T12:00:00Z" }),
      row({ id: "run-1", status: "running" }),
    ]);
    expect(out.sessionIssueIds).toEqual(["issue-1"]);
    expect(out.workingIssueIds).toEqual(["issue-1"]);
  });

  it("dédoublonne les sessions par issue", () => {
    const out = buildAgentActivity([
      row({ issue_id: "issue-A", id: "a1", status: "running" }),
      row({ issue_id: "issue-B", id: "b1", status: "completed" }),
    ]);
    expect(out.workingIssueIds).toEqual(["issue-A"]);
    expect(out.sessionIssueIds).toEqual(["issue-A", "issue-B"]);
  });
});

/**
 * La PR d'un ticket ne se lit PLUS sur les runs (MIN-163) : une PR humaine, ou
 * une PR rattachée à la main, n'a aucun run — le ticket disait alors « pas de
 * pull request » alors qu'il en avait une. Elle vient de `pull_requests`, et
 * TOUS ses états comptent : « Voir la pull request » doit mener à une PR fermée
 * comme à une PR ouverte. C'est le chip de la carte qui, lui, écarte `closed`,
 * avec le `state` qu'on lui rend ici.
 */
function prRow(over: Partial<IssuePrRow> = {}): IssuePrRow {
  return {
    id: "pr-1",
    issue_id: "issue-1",
    number: 7,
    state: "open",
    updated_at: "2026-07-15T10:00:00Z",
    ...over,
  };
}

describe("pullRequests", () => {
  it("expose la PR du ticket, sans qu'aucun run ne la porte", () => {
    // Le cas qui manquait : PR humaine (ou rattachée à la main), zéro run.
    const out = buildAgentActivity([], [prRow()]);
    expect(out.sessionIssueIds).toEqual([]);
    expect(out.pullRequests["issue-1"]).toEqual({
      prId: "pr-1",
      prNumber: 7,
      state: "open",
    });
  });

  it("expose aussi une PR FERMÉE — le lien y mène quel que soit l'état", () => {
    const out = buildAgentActivity([], [prRow({ state: "closed" })]);
    expect(out.pullRequests["issue-1"]?.state).toBe("closed");
  });

  it("une PR VIVANTE l'emporte sur une PR terminale plus récente", () => {
    // Cas réel : la PR fermée vient d'être touchée (un commentaire), celle qu'on
    // veut relire est l'ouverte. La fraîcheur ne doit pas gagner contre elle.
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-closed", number: 9, state: "closed", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-open", number: 8, state: "open", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out.pullRequests["issue-1"]?.prId).toBe("pr-open");
  });

  it("à défaut de PR vivante, la plus récemment touchée gagne", () => {
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-recent", number: 9, state: "merged", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-old", number: 8, state: "closed", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out.pullRequests["issue-1"]?.prId).toBe("pr-recent");
  });

  it("une PR sans ticket n'entre nulle part", () => {
    expect(buildAgentActivity([], [prRow({ issue_id: null })]).pullRequests).toEqual({});
  });

  it("chaque ticket a sa PR", () => {
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-a", issue_id: "issue-A", number: 1 }),
        prRow({ id: "pr-b", issue_id: "issue-B", number: 2, state: "merged" }),
      ],
    );
    expect(out.pullRequests).toEqual({
      "issue-A": { prId: "pr-a", prNumber: 1, state: "open" },
      "issue-B": { prId: "pr-b", prNumber: 2, state: "merged" },
    });
  });
});
