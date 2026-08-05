import { describe, expect, it } from "vitest";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import {
  displayLineOf,
  groupReviewThreads,
  type ReviewThreadState,
} from "@/lib/pr-review-threads";

/**
 * Les cas ci-dessous reproduisent le comportement RÉEL de l'API GitHub, relevé
 * contre une vraie PR : c'est lui qui dicte les règles, pas l'intuition.
 */

function comment(over: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment {
  return {
    id: 1,
    body: "body",
    path: "probe.txt",
    line: 150,
    original_line: 150,
    side: "RIGHT",
    in_reply_to_id: null,
    review_id: null,
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

  it("garde UN fil quand la racine supprimée laisse plusieurs réponses", () => {
    // Racine 999 effacée sur la forge : ses réponses gardent `in_reply_to_id:999`.
    // Les promouvoir une par une donnait autant de fils que de réponses — et la
    // seconde perdait aussi son état de résolution, apparié sur la seule racine.
    const threads = groupReviewThreads(
      [
        comment({ id: 12, in_reply_to_id: 999, created_at: "2026-07-17T10:05:00Z" }),
        comment({ id: 11, in_reply_to_id: 999, created_at: "2026-07-17T10:01:00Z" }),
      ],
      [{ rootCommentId: 11, threadId: "PRRT_kwDOABC", resolved: true, resolvedBy: "alice" }],
    );
    expect(threads).toHaveLength(1);
    // La plus ANCIENNE survivante fait racine — la même que rend la forge.
    expect(threads[0].id).toBe(11);
    expect(threads[0].comments.map((c) => c.id)).toEqual([11, 12]);
    expect(threads[0].resolution?.resolved).toBe(true);
  });

  it("ne fusionne pas deux fils distincts dont les racines ont disparu", () => {
    const threads = groupReviewThreads([
      comment({ id: 11, in_reply_to_id: 998, created_at: "2026-07-17T10:01:00Z" }),
      comment({ id: 21, in_reply_to_id: 999, created_at: "2026-07-17T11:01:00Z" }),
    ]);
    expect(threads.map((t) => t.id)).toEqual([11, 21]);
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

describe("displayLineOf", () => {
  it("se rabat sur original_line quand GitHub a effacé line", () => {
    expect(displayLineOf(comment({ line: null, original_line: 42 }))).toBe(42);
    expect(displayLineOf(comment({ line: 7, original_line: 42 }))).toBe(7);
  });
});
