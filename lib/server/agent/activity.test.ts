import { describe, expect, it } from "vitest";
import { buildAgentActivity, type AgentRunRow } from "./activity";

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

  it("expose la PR la plus récente non fermée, tous runs confondus", () => {
    const out = buildAgentActivity([
      row({ id: "run-2", status: "completed", pr_number: 7, pr_state: "open", created_at: "2026-07-15T12:00:00Z" }),
      row({ id: "run-1", status: "completed", pr_number: 4, pr_state: "merged" }),
    ]);
    expect(out.pullRequests["issue-1"]).toEqual({ runId: "run-2", prNumber: 7 });
  });

  it("ignore une PR fermée pour le chip « PR disponible »", () => {
    const out = buildAgentActivity([
      row({ status: "completed", pr_number: 7, pr_state: "closed" }),
    ]);
    expect(out.pullRequests).toEqual({});
  });

  it("garde une PR FUSIONNÉE dans le chip (seule `closed` est exclue)", () => {
    // `merged` est le seul état de PR traité à part (inheritablePrForIssue renvoie
    // null → branche neuve) : on verrouille ici qu'il reste néanmoins affiché,
    // sinon le lien vers le travail livré disparaîtrait de la carte.
    const out = buildAgentActivity([
      row({ status: "completed", pr_number: 7, pr_state: "merged" }),
    ]);
    expect(out.pullRequests["issue-1"]).toEqual({ runId: "run-1", prNumber: 7 });
  });

  it("dédoublonne par issue : chaque issue a sa propre PR et son propre état", () => {
    const out = buildAgentActivity([
      row({ issue_id: "issue-A", id: "a1", status: "running", pr_number: 1, pr_state: "open" }),
      row({ issue_id: "issue-B", id: "b1", status: "completed", pr_number: 2, pr_state: "open" }),
    ]);
    expect(out.workingIssueIds).toEqual(["issue-A"]);
    expect(out.sessionIssueIds).toEqual(["issue-A", "issue-B"]);
    expect(out.pullRequests).toEqual({
      "issue-A": { runId: "a1", prNumber: 1 },
      "issue-B": { runId: "b1", prNumber: 2 },
    });
  });
});
