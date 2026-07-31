import { describe, expect, it } from "vitest";
import { parseDiff, expandFromRawCode, type HunkData } from "react-diff-view";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import {
  displayLineOf,
  groupReviewThreads,
  type ReviewThreadState,
} from "@/lib/pr-review-threads";
import {
  commentableChangeKeys,
  gutterAnchor,
  resolveThreadChangeKey,
} from "@/lib/pr-review-diff";

/**
 * Les cas ci-dessous reproduisent le comportement RÉEL de l'API GitHub, relevé
 * contre une vraie PR : c'est lui qui dicte les règles, pas l'intuition.
 */

/** Fichier de 200 lignes — la source « base » du dépliage. */
const SOURCE = Array.from({ length: 200 }, (_, i) => `line ${i + 1}: content`);

/** Diff dont le SEUL hunk touche la ligne 150 (contexte 147→153). */
const DIFF = `diff --git a/probe.txt b/probe.txt
--- a/probe.txt
+++ b/probe.txt
@@ -147,7 +147,7 @@
 line 147: content
 line 148: content
 line 149: content
-line 150: content
+line 150: changed
 line 151: content
 line 152: content
 line 153: content
`;

function hunksOf(diff: string): HunkData[] {
  return parseDiff(diff)[0].hunks;
}

function comment(over: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment {
  return {
    id: 1,
    body: "body",
    path: "probe.txt",
    line: 150,
    original_line: 150,
    side: "RIGHT",
    in_reply_to_id: null,
    diff_hunk: "@@ -147,7 +147,7 @@",
    user: { login: "someone", avatar_url: null },
    created_at: "2026-07-17T10:00:00Z",
    html_url: "https://github.com/o/r/pull/1#discussion_r1",
    ...over,
  };
}

describe("groupReviewThreads", () => {
  it("regroupe les réponses sous leur racine, dans l'ordre chronologique", () => {
    const threads = groupReviewThreads([
      comment({ id: 10, created_at: "2026-07-17T10:00:00Z" }),
      comment({ id: 11, in_reply_to_id: 10, created_at: "2026-07-17T10:05:00Z" }),
      comment({ id: 12, in_reply_to_id: 10, created_at: "2026-07-17T10:02:00Z" }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(10);
    expect(threads[0].root.id).toBe(10);
    expect(threads[0].comments.map((c) => c.id)).toEqual([10, 12, 11]);
  });

  it("rattache à la racine une réponse-de-réponse (GitHub aplatit les fils)", () => {
    // Vérifié contre l'API : répondre à la réponse 11 renvoie in_reply_to_id = 10.
    const threads = groupReviewThreads([
      comment({ id: 10 }),
      comment({ id: 11, in_reply_to_id: 10 }),
      comment({ id: 12, in_reply_to_id: 10 }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].comments).toHaveLength(3);
  });

  it("sépare deux fils distincts sur la même ligne", () => {
    const threads = groupReviewThreads([
      comment({ id: 10, created_at: "2026-07-17T10:00:00Z" }),
      comment({ id: 20, created_at: "2026-07-17T11:00:00Z" }),
      comment({ id: 21, in_reply_to_id: 20 }),
    ]);
    expect(threads.map((t) => t.id)).toEqual([10, 20]);
  });

  it("promeut en racine une réponse dont la racine manque, plutôt que de la perdre", () => {
    const threads = groupReviewThreads([comment({ id: 11, in_reply_to_id: 999 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(11);
  });
});

/**
 * MIN-139 : l'état de résolution vient d'un AUTRE appel que les commentaires
 * (GraphQL côté GitHub, discussions côté GitLab). Tout tient donc à l'appariement
 * par l'id de la RACINE — la seule clé que les deux forges donnent, et celle sur
 * laquelle le regroupement travaille déjà.
 */
describe("groupReviewThreads — état de résolution", () => {
  const state = (over: Partial<ReviewThreadState> = {}): ReviewThreadState => ({
    rootCommentId: 10,
    threadId: "PRRT_kwDOABC",
    resolved: true,
    resolvedBy: "alice",
    ...over,
  });

  it("attache l'état au fil par l'id de sa racine, réponses comprises", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 }), comment({ id: 11, in_reply_to_id: 10 })],
      [state()],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].resolution).toEqual(state());
    expect(threads[0].comments).toHaveLength(2);
  });

  it("laisse `resolution` indéfini quand l'état n'est pas connu — pas « non résolu »", () => {
    // La nuance porte l'UI : un fil d'état inconnu n'offre pas « Résoudre »,
    // là où un fil connu non résolu l'offre.
    const [thread] = groupReviewThreads([comment({ id: 10 })]);
    expect(thread.resolution).toBeUndefined();
    const [withEmpty] = groupReviewThreads([comment({ id: 10 })], []);
    expect(withEmpty.resolution).toBeUndefined();
  });

  it("n'applique un état résolu qu'au fil visé, pas à ses voisins", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 }), comment({ id: 20, created_at: "2026-07-17T11:00:00Z" })],
      [state({ rootCommentId: 20, resolved: true })],
    );
    expect(threads.map((t) => !!t.resolution?.resolved)).toEqual([false, true]);
  });

  it("ignore un état dont le fil est absent (listes lues à deux instants)", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 })],
      [state({ rootCommentId: 999 })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].resolution).toBeUndefined();
  });

  it("suit la racine PROMUE d'un fil tronqué par la pagination", () => {
    // La réponse orpheline devient sa propre racine : c'est cet id-là qui
    // s'apparie, sinon un fil coupé perdrait son état de résolution.
    const threads = groupReviewThreads(
      [comment({ id: 11, in_reply_to_id: 999 })],
      [state({ rootCommentId: 11, resolved: false, resolvedBy: null })],
    );
    expect(threads[0].resolution?.threadId).toBe("PRRT_kwDOABC");
    expect(threads[0].resolution?.resolved).toBe(false);
  });
});

describe("resolveThreadChangeKey", () => {
  const hunks = hunksOf(DIFF);

  it("ancre un commentaire sur la ligne modifiée (side RIGHT)", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "RIGHT" })]);
    expect(resolveThreadChangeKey(hunks, thread)).toBe("I150");
  });

  it("ancre un commentaire sur une ligne de contexte du hunk", () => {
    const [thread] = groupReviewThreads([comment({ line: 148, side: "RIGHT" })]);
    // Une ligne normale est indexée sur son ancien numéro : N148.
    expect(resolveThreadChangeKey(hunks, thread)).toBe("N148");
  });

  it("ancre un commentaire sur une ligne supprimée (side LEFT, numérotation ancienne)", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "LEFT" })]);
    expect(resolveThreadChangeKey(hunks, thread)).toBe("D150");
  });

  it("traite comme périmé un commentaire dont GitHub a effacé la ligne", () => {
    const [thread] = groupReviewThreads([comment({ line: null, original_line: 150 })]);
    expect(resolveThreadChangeKey(hunks, thread)).toBeNull();
  });

  it("traite comme périmé un `line` non nul qui ne tombe dans AUCUN hunk", () => {
    // Le cas qui piège : relevé sur l'API réelle, un commentaire posé sur une
    // ligne de CONTEXTE garde son `line` après que le diff a bougé ailleurs.
    // Se fier à `line !== null` le ferait disparaître de l'écran.
    const [thread] = groupReviewThreads([comment({ line: 97, side: "RIGHT" })]);
    expect(thread.root.line).not.toBeNull();
    expect(resolveThreadChangeKey(hunks, thread)).toBeNull();
  });

  it("ramène un fil à sa place dès que le contexte qui le porte est déplié", () => {
    const expanded = expandFromRawCode(hunks, SOURCE, 90, 100);
    const [thread] = groupReviewThreads([comment({ line: 97, side: "RIGHT" })]);
    expect(resolveThreadChangeKey(hunks, thread)).toBeNull();
    expect(resolveThreadChangeKey(expanded, thread)).toBe("N97");
  });
});

describe("commentableChangeKeys", () => {
  it("retient les lignes des hunks d'origine", () => {
    const keys = commentableChangeKeys(hunksOf(DIFF));
    expect(keys.has("I150")).toBe(true);
    expect(keys.has("D150")).toBe(true);
    expect(keys.has("N148")).toBe(true);
  });

  it("EXCLUT les lignes dépliées — GitHub les refuse en 422", () => {
    // L'ensemble se calcule sur les hunks d'ORIGINE : une ligne dépliée (97) est
    // affichée mais hors diff, et proposer le « + » dessus offrirait un 422.
    const original = hunksOf(DIFF);
    const expanded = expandFromRawCode(original, SOURCE, 90, 100);
    const keys = commentableChangeKeys(original);

    expect(commentableChangeKeys(expanded).has("N97")).toBe(true);
    expect(keys.has("N97")).toBe(false);
  });
});

describe("gutterAnchor", () => {
  const changes = hunksOf(DIFF)[0].changes;
  const insert = changes.find((c) => c.type === "insert")!;
  const del = changes.find((c) => c.type === "delete")!;
  const normal = changes.find((c) => c.type === "normal")!;

  it("ancre un ajout à droite, et rien sur la gouttière d'en face", () => {
    expect(gutterAnchor(insert, "new")).toEqual({ side: "RIGHT", line: 150 });
    expect(gutterAnchor(insert, "old")).toBeNull();
  });

  it("ancre une suppression à gauche, et rien sur la gouttière d'en face", () => {
    expect(gutterAnchor(del, "old")).toEqual({ side: "LEFT", line: 150 });
    expect(gutterAnchor(del, "new")).toBeNull();
  });

  it("ancre une ligne de contexte à droite seulement (une seule affordance)", () => {
    expect(gutterAnchor(normal, "new")).toEqual({ side: "RIGHT", line: 147 });
    expect(gutterAnchor(normal, "old")).toBeNull();
  });
});

describe("displayLineOf", () => {
  it("se rabat sur original_line quand GitHub a effacé line", () => {
    expect(displayLineOf(comment({ line: null, original_line: 42 }))).toBe(42);
    expect(displayLineOf(comment({ line: 7, original_line: 42 }))).toBe(7);
  });
});
