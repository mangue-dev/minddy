import { describe, expect, it } from "vitest";
import {
  githubPrState,
  githubPrStateForAction,
  gitlabMrState,
  gitlabMrStateForAction,
  isPullRequestComment,
  isServiceAccountGesture,
  prActionForMergeRequest,
  prActionForNote,
  prActionForPullRequest,
  prActionForReview,
} from "./pr-webhook-core";

/**
 * The two “forge event → done minddy” tables: the PR STATUS, and the
 * ticket activity line. They get SILENT wrong — a poorly spelled action doesn't raise anything, it simply never traces anything, and no one notices a missing line. A false state is visible: it moves the
 * ticket.
 */

describe("githubPrState", () => {
  it("fusionnée l'emporte sur fermée — GitHub ferme une PR en la fusionnant", () => {
    expect(githubPrState({ state: "closed", merged: true })).toBe("merged");
    // The *list* endpoint does not return `merged`: `merged_at` is the only signal.
    expect(githubPrState({ state: "closed", merged_at: "2026-01-02T00:00:00Z" })).toBe("merged");
    expect(githubPrState({ state: "closed" })).toBe("closed");
  });

  it("un brouillon n'est brouillon que tant qu'il est OUVERT", () => {
    expect(githubPrState({ state: "open", draft: true })).toBe("draft");
    // GitHub keeps `draft: true` in a closed draft: announce it as “draft”
    // would hide that he is dead.
    expect(githubPrState({ state: "closed", draft: true })).toBe("closed");
    expect(githubPrState({ state: "open" })).toBe("open");
  });
});

describe("githubPrStateForAction", () => {
  it("une PR ROUVERTE restée brouillon reste un brouillon", () => {
    // The MIN-164 bug: `reopened` was “open” hard, and the ticket
    // went on a review for a job that no one had offered (MIN-138).
    expect(githubPrStateForAction("reopened", { state: "open", draft: true })).toBe("draft");
    expect(githubPrStateForAction("reopened", { state: "open" })).toBe("open");
  });

  it("pilote l'état dès l'OUVERTURE, comme le récepteur GitLab", () => {
    // Without `opened`, opening a human PR that cites a ticket had no effect
    // only on GitLab, while merge had it on both sides.
    expect(githubPrStateForAction("opened", { state: "open" })).toBe("open");
    expect(githubPrStateForAction("opened", { state: "open", draft: true })).toBe("draft");
  });

  it("couvre les deux sens de la bascule brouillon", () => {
    expect(githubPrStateForAction("converted_to_draft", { state: "open", draft: true })).toBe(
      "draft",
    );
    expect(githubPrStateForAction("ready_for_review", { state: "open" })).toBe("open");
  });

  it("ne touche à l'état sur AUCUNE autre action", () => {
    // A push (`synchronize`) or a title edit (`edited`) sets the PR to
    // day, never its state.
    for (const action of ["synchronize", "edited", "labeled", "assigned"]) {
      expect(githubPrStateForAction(action, { state: "open" })).toBeNull();
    }
  });
});

describe("gitlabMrState", () => {
  it("lit les DEUX noms du brouillon", () => {
    expect(gitlabMrState({ state: "opened", draft: true })).toBe("draft");
    // GitLab renamed `work_in_progress` to `draft` in 14.0: an instance
    // older self-hosted only sends the old one.
    expect(gitlabMrState({ state: "opened", work_in_progress: true })).toBe("draft");
    expect(gitlabMrState({ state: "opened" })).toBe("open");
  });

  it("`locked` est transitoire, pas un cinquième état", () => {
    expect(gitlabMrState({ state: "locked" })).toBe("open");
    expect(gitlabMrState({ state: "merged" })).toBe("merged");
    expect(gitlabMrState({ state: "closed" })).toBe("closed");
  });
});

describe("gitlabMrStateForAction", () => {
  it("une MR rouverte en brouillon reste un brouillon", () => {
    expect(
      gitlabMrStateForAction({ object_attributes: { action: "reopen", state: "opened", draft: true } }),
    ).toBe("draft");
  });

  it("ne relit l'état sur `update` que s'il touche au titre ou au brouillon", () => {
    // The draft has no dedicated action at GitLab: it lives in the prefix
    // `Draft:` of the title. Without this guard, retouching a description would rewrite
    // the status — and, in cascade, the status of the ticket — at each edition.
    const attrs = { action: "update", state: "opened", draft: true };
    expect(gitlabMrStateForAction({ object_attributes: attrs, changes: { title: {} } })).toBe(
      "draft",
    );
    expect(gitlabMrStateForAction({ object_attributes: attrs })).toBeNull();
  });

  it("une MR déjà fermée ne rebascule pas en brouillon sur un renommage", () => {
    expect(
      gitlabMrStateForAction({
        object_attributes: { action: "update", state: "closed", draft: true },
        changes: { title: {} },
      }),
    ).toBeNull();
  });
});

describe("prActionForPullRequest (GitHub)", () => {
  it("trace l'ouverture et le push", () => {
    expect(prActionForPullRequest("opened", false)).toBe("pr_opened");
    // `synchronize` IS the GitHub name of a push to the PR branch.
    expect(prActionForPullRequest("synchronize", false)).toBe("pr_committed");
  });

  it("sépare la fermeture fusionnée de la fermeture sèche", () => {
    expect(prActionForPullRequest("closed", true)).toBe("pr_accepted");
    expect(prActionForPullRequest("closed", false)).toBe("pr_rejected");
  });

  it("trace la réouverture, distincte d'une ouverture", () => {
    // MIN-164: This was the only lifecycle transition without a line. THE
    // ticket repassait en revue sans que rien ne dise ce qui l'y avait remis.
    expect(prActionForPullRequest("reopened", false)).toBe("pr_reopened");
  });

  it("ignore le bruit de forge", () => {
    // `converted_to_draft` / `ready_for_review` change the STATUS (therefore the status
    // of the ticket, which tells itself) but are not facts of the ticket.
    for (const action of ["edited", "labeled", "assigned", "ready_for_review"]) {
      expect(prActionForPullRequest(action, false)).toBeNull();
    }
  });
});

describe("prActionForReview (GitHub)", () => {
  it("trace les verdicts", () => {
    expect(prActionForReview({ state: "approved" })).toBe("pr_approved");
    expect(prActionForReview({ state: "changes_requested" })).toBe("pr_changes_requested");
  });

  it("ne trace une review « commented » que si elle porte un message", () => {
    expect(prActionForReview({ state: "commented", body: "à revoir" })).toBe("pr_commented");
    // Without body, the review is only the envelope of line remarks, already
    // drawn one by one: drawing it would add a line without text behind.
    expect(prActionForReview({ state: "commented", body: "" })).toBeNull();
    expect(prActionForReview({ state: "commented", body: "   " })).toBeNull();
    expect(prActionForReview({ state: "commented" })).toBeNull();
  });

  it("ignore le retrait de review", () => {
    expect(prActionForReview({ state: "dismissed", body: "peu importe" })).toBeNull();
  });
});

describe("isPullRequestComment (GitHub)", () => {
  it("ne retient que les commentaires de PR nouvellement créés", () => {
    expect(isPullRequestComment({ action: "created", issue: { pull_request: {} } })).toBe(true);
    // A remote issue is not within our control (one-way sync).
    expect(isPullRequestComment({ action: "created", issue: {} })).toBe(false);
    expect(isPullRequestComment({ action: "edited", issue: { pull_request: {} } })).toBe(false);
    expect(isPullRequestComment({ action: "deleted", issue: { pull_request: {} } })).toBe(false);
  });
});

describe("prActionForMergeRequest (GitLab)", () => {
  it("trace l'ouverture, la réouverture, la fusion, le refus et l'approbation", () => {
    expect(prActionForMergeRequest({ action: "open" })).toBe("pr_opened");
    expect(prActionForMergeRequest({ action: "reopen" })).toBe("pr_reopened");
    expect(prActionForMergeRequest({ action: "merge" })).toBe("pr_accepted");
    expect(prActionForMergeRequest({ action: "close" })).toBe("pr_rejected");
    expect(prActionForMergeRequest({ action: "approved" })).toBe("pr_approved");
    expect(prActionForMergeRequest({ action: "approval" })).toBe("pr_approved");
  });

  it("ne lit un push que sur l'`update` qui porte `oldrev`", () => {
    // GitLab n'a pas d'action « push » : un changement de titre, de description
    // or label arrives with the SAME action. Only `oldrev` says that the head
    // moved — without this guard, editing a description would say "committed".
    expect(prActionForMergeRequest({ action: "update", oldrev: "abc123" })).toBe("pr_committed");
    expect(prActionForMergeRequest({ action: "update" })).toBeNull();
  });

  it("ignore le retrait d'approbation", () => {
    expect(prActionForMergeRequest({ action: "unapproved" })).toBeNull();
    expect(prActionForMergeRequest({ action: "unapproval" })).toBeNull();
  });
});

describe("prActionForNote (GitLab)", () => {
  it("sépare le message de fil de la remarque de ligne par l'ancrage", () => {
    expect(prActionForNote({ noteable_type: "MergeRequest" })).toBe("pr_commented");
    expect(
      prActionForNote({ noteable_type: "MergeRequest", position: { new_line: 12 } }),
    ).toBe("pr_code_commented");
  });

  it("ignore les notes qui ne portent pas sur une merge request", () => {
    // Un `Note Hook` couvre tout ce qui se commente chez GitLab.
    for (const noteable of ["Issue", "Commit", "Snippet", undefined]) {
      expect(prActionForNote({ noteable_type: noteable })).toBeNull();
    }
  });
});

describe("isServiceAccountGesture (GitLab)", () => {
  it("couvre les gestes que minddy fait sous le token du compte connecté", () => {
    // Open and push are part of it since the agent traces itself: without
    // that, each Numo PR would carry two “opened” lines.
    for (const type of [
      "pr_accepted",
      "pr_rejected",
      "pr_opened",
      "pr_reopened",
      "pr_committed",
    ] as const) {
      expect(isServiceAccountGesture(type)).toBe(true);
    }
  });

  it("laisse les COMMENTAIRES dehors", () => {
    // Personne ne commente sous ce token : un commentaire in-app part du compte
    // person's git. Putting it there would silence, forever, the
    // comments from whoever linked the repository.
    expect(isServiceAccountGesture("pr_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_code_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_approved")).toBe(false);
  });
});
