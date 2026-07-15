import { describe, expect, it } from "vitest";
import { buildAgentActivity, type AgentRunRow } from "./activity";

/**
 * Sémantique de l'activité par issue après MIN-68. Le point sensible : `session`
 * ne veut plus dire « une run existe » mais « une run OCCUPE l'issue ». C'est ce qui
 * décide si la carte propose d'OUVRIR une run ou d'en LANCER une nouvelle — s'il
 * régresse, une issue dont la dernière run est terminée redevient inlançable.
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
  it("ne compte PAS une run terminée comme occupant l'issue", () => {
    const out = buildAgentActivity([row({ status: "completed" })]);
    expect(out.sessionIssueIds).toEqual([]);
    expect(out.workingIssueIds).toEqual([]);
  });

  it("compte les runs actives : au travail comme suspendues", () => {
    for (const status of ["queued", "running", "needs_input"]) {
      const out = buildAgentActivity([row({ status })]);
      expect(out.sessionIssueIds, status).toEqual(["issue-1"]);
    }
  });

  it("ne signale « travaille » que pour queued/running (pas needs_input)", () => {
    expect(buildAgentActivity([row({ status: "needs_input" })]).workingIssueIds).toEqual([]);
    expect(buildAgentActivity([row({ status: "running" })]).workingIssueIds).toEqual(["issue-1"]);
  });

  it("une run active plus ancienne occupe l'issue même sous une run terminée", () => {
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
    // `merged` est le seul état de PR que MIN-68 traite à part (inheritablePrForIssue
    // renvoie null → branche neuve) : on verrouille ici qu'il reste néanmoins
    // affiché, sinon le lien vers le travail livré disparaîtrait de la carte.
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
    expect(out.sessionIssueIds).toEqual(["issue-A"]);
    expect(out.pullRequests).toEqual({
      "issue-A": { runId: "a1", prNumber: 1 },
      "issue-B": { runId: "b1", prNumber: 2 },
    });
  });

  it("une run annulée n'occupe pas l'issue", () => {
    expect(buildAgentActivity([row({ status: "canceled" })]).sessionIssueIds).toEqual([]);
  });
});
