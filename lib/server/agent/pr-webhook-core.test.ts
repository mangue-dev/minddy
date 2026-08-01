import { describe, expect, it } from "vitest";
import {
  isPullRequestComment,
  isServiceAccountGesture,
  prActionForMergeRequest,
  prActionForNote,
  prActionForPullRequest,
  prActionForReview,
} from "./pr-webhook-core";

/**
 * La table de correspondance « événement de forge → ligne d'activité de ticket ».
 * Elle se trompe en SILENCE : une action mal orthographiée ne lève rien, elle ne
 * trace simplement jamais rien — et personne ne remarque une ligne absente.
 */

describe("prActionForPullRequest (GitHub)", () => {
  it("trace l'ouverture et le push", () => {
    expect(prActionForPullRequest("opened", false)).toBe("pr_opened");
    // `synchronize` EST le nom GitHub d'un push sur la branche de la PR.
    expect(prActionForPullRequest("synchronize", false)).toBe("pr_committed");
  });

  it("sépare la fermeture fusionnée de la fermeture sèche", () => {
    expect(prActionForPullRequest("closed", true)).toBe("pr_accepted");
    expect(prActionForPullRequest("closed", false)).toBe("pr_rejected");
  });

  it("ignore le bruit de forge", () => {
    for (const action of ["edited", "labeled", "assigned", "reopened", "ready_for_review"]) {
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
    // Sans corps, la review n'est que l'enveloppe des remarques de ligne, déjà
    // tracées une à une : la tracer ajouterait une ligne sans texte derrière.
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
    // Une issue distante n'est pas de notre ressort (synchro à sens unique).
    expect(isPullRequestComment({ action: "created", issue: {} })).toBe(false);
    expect(isPullRequestComment({ action: "edited", issue: { pull_request: {} } })).toBe(false);
    expect(isPullRequestComment({ action: "deleted", issue: { pull_request: {} } })).toBe(false);
  });
});

describe("prActionForMergeRequest (GitLab)", () => {
  it("trace l'ouverture, la fusion, le refus et l'approbation", () => {
    expect(prActionForMergeRequest({ action: "open" })).toBe("pr_opened");
    expect(prActionForMergeRequest({ action: "merge" })).toBe("pr_accepted");
    expect(prActionForMergeRequest({ action: "close" })).toBe("pr_rejected");
    expect(prActionForMergeRequest({ action: "approved" })).toBe("pr_approved");
    expect(prActionForMergeRequest({ action: "approval" })).toBe("pr_approved");
  });

  it("ne lit un push que sur l'`update` qui porte `oldrev`", () => {
    // GitLab n'a pas d'action « push » : un changement de titre, de description
    // ou d'étiquette arrive avec la MÊME action. Seul `oldrev` dit que la tête
    // a bougé — sans ce garde, éditer une description dirait « a commité ».
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
    // Ouvrir et pousser en font partie depuis que l'agent trace lui-même : sans
    // ça, chaque PR de Numo porterait deux lignes « a ouvert ».
    for (const type of ["pr_accepted", "pr_rejected", "pr_opened", "pr_committed"] as const) {
      expect(isServiceAccountGesture(type)).toBe(true);
    }
  });

  it("laisse les COMMENTAIRES dehors", () => {
    // Personne ne commente sous ce token : un commentaire in-app part du compte
    // git de la personne. L'y mettre rendrait muets, pour toujours, les
    // commentaires de celui qui a lié le dépôt.
    expect(isServiceAccountGesture("pr_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_code_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_approved")).toBe(false);
  });
});
