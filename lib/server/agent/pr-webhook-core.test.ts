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
 * Les deux tables « événement de forge → fait minddy » : l'ÉTAT de la PR, et la
 * ligne d'activité du ticket. Elles se trompent en SILENCE — une action mal
 * orthographiée ne lève rien, elle ne trace simplement jamais rien, et personne
 * ne remarque une ligne absente. Un état faux, lui, se voit : il déplace le
 * ticket.
 */

describe("githubPrState", () => {
  it("fusionnée l'emporte sur fermée — GitHub ferme une PR en la fusionnant", () => {
    expect(githubPrState({ state: "closed", merged: true })).toBe("merged");
    // L'endpoint *list* ne renvoie pas `merged` : `merged_at` est le seul signal.
    expect(githubPrState({ state: "closed", merged_at: "2026-01-02T00:00:00Z" })).toBe("merged");
    expect(githubPrState({ state: "closed" })).toBe("closed");
  });

  it("un brouillon n'est brouillon que tant qu'il est OUVERT", () => {
    expect(githubPrState({ state: "open", draft: true })).toBe("draft");
    // GitHub garde `draft: true` sur un brouillon fermé : l'annoncer « brouillon »
    // cacherait qu'il est mort.
    expect(githubPrState({ state: "closed", draft: true })).toBe("closed");
    expect(githubPrState({ state: "open" })).toBe("open");
  });
});

describe("githubPrStateForAction", () => {
  it("une PR ROUVERTE restée brouillon reste un brouillon", () => {
    // Le bug de MIN-164 : `reopened` valait « ouverte » en dur, et le ticket
    // partait en revue pour un travail que personne n'avait proposé (MIN-138).
    expect(githubPrStateForAction("reopened", { state: "open", draft: true })).toBe("draft");
    expect(githubPrStateForAction("reopened", { state: "open" })).toBe("open");
  });

  it("pilote l'état dès l'OUVERTURE, comme le récepteur GitLab", () => {
    // Sans `opened`, ouvrir une PR humaine qui cite un ticket n'avait d'effet
    // que sur GitLab, alors que la fusionner en avait des deux côtés.
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
    // Un push (`synchronize`) ou une retouche de titre (`edited`) mettent la PR à
    // jour, jamais son état.
    for (const action of ["synchronize", "edited", "labeled", "assigned"]) {
      expect(githubPrStateForAction(action, { state: "open" })).toBeNull();
    }
  });
});

describe("gitlabMrState", () => {
  it("lit les DEUX noms du brouillon", () => {
    expect(gitlabMrState({ state: "opened", draft: true })).toBe("draft");
    // GitLab a renommé `work_in_progress` en `draft` en 14.0 : une instance
    // auto-hébergée plus ancienne n'envoie que l'ancien.
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
    // Le brouillon n'a pas d'action dédiée chez GitLab : il vit dans le préfixe
    // `Draft:` du titre. Sans ce garde, retoucher une description réécrirait
    // l'état — et, en cascade, le statut du ticket — à chaque édition.
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
    // `synchronize` EST le nom GitHub d'un push sur la branche de la PR.
    expect(prActionForPullRequest("synchronize", false)).toBe("pr_committed");
  });

  it("sépare la fermeture fusionnée de la fermeture sèche", () => {
    expect(prActionForPullRequest("closed", true)).toBe("pr_accepted");
    expect(prActionForPullRequest("closed", false)).toBe("pr_rejected");
  });

  it("trace la réouverture, distincte d'une ouverture", () => {
    // MIN-164 : c'était la seule transition du cycle de vie sans ligne. Le
    // ticket repassait en revue sans que rien ne dise ce qui l'y avait remis.
    expect(prActionForPullRequest("reopened", false)).toBe("pr_reopened");
  });

  it("ignore le bruit de forge", () => {
    // `converted_to_draft` / `ready_for_review` changent l'ÉTAT (donc le statut
    // du ticket, qui se raconte tout seul) mais ne sont pas des faits du ticket.
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
    // git de la personne. L'y mettre rendrait muets, pour toujours, les
    // commentaires de celui qui a lié le dépôt.
    expect(isServiceAccountGesture("pr_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_code_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_approved")).toBe(false);
  });
});
