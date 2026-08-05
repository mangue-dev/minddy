import { describe, expect, it } from "vitest";
import { parsePatchFiles, type Hunk } from "@pierre/diffs";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import {
  anchorKey,
  commentAnchor,
  isLineInDiff,
  lineKind,
  sharedStartLine,
  threadAnchor,
  toDiffSide,
  toGithubSide,
} from "@/lib/pr-diff-anchors";

/**
 * Les cas ci-dessous reproduisent le comportement RÉEL de l'API GitHub, relevé
 * contre une vraie PR : c'est lui qui dicte les règles, pas l'intuition.
 */

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

const HUNKS: Hunk[] = parsePatchFiles(DIFF)[0].files[0].hunks;

function comment(over: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment {
  return {
    id: 1,
    body: "body",
    path: "probe.txt",
    line: 150,
    original_line: 150,
    side: "RIGHT",
    start_line: null,
    start_side: null,
    in_reply_to_id: null,
    review_id: null,
    diff_hunk: "@@ -147,7 +147,7 @@",
    user: { login: "someone", avatar_url: null },
    created_at: "2026-07-17T10:00:00Z",
    html_url: "https://github.com/o/r/pull/1#discussion_r1",
    ...over,
  };
}

describe("toDiffSide / toGithubSide", () => {
  it("apparie les deux vocabulaires du même côté", () => {
    expect(toDiffSide("LEFT")).toBe("deletions");
    expect(toDiffSide("RIGHT")).toBe("additions");
    expect(toGithubSide("deletions")).toBe("LEFT");
    expect(toGithubSide("additions")).toBe("RIGHT");
  });
});

describe("threadAnchor", () => {
  it("ancre un commentaire de droite sur la ligne nouvelle", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "RIGHT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "additions", line: 150 });
  });

  it("ancre un commentaire de gauche sur la ligne ancienne", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "LEFT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "deletions", line: 150 });
  });

  it("n'ancre rien quand GitHub a effacé la ligne", () => {
    const [thread] = groupReviewThreads([comment({ line: null, original_line: 150 })]);
    expect(threadAnchor(thread)).toBeNull();
  });

  it("rend l'ancre DÉCLARÉE, même hors des hunks — c'est le rendu qui tranche", () => {
    // Le cas qui piège : relevé sur l'API réelle, un commentaire posé sur une
    // ligne de CONTEXTE garde son `line` après que le diff a bougé ailleurs. On
    // ne le déclare pas périmé ici : la lib ne créera simplement pas de `<slot>`
    // pour cette ligne, et il se repliera dans les « périmés » — jusqu'à ce
    // qu'un dépliage de contexte le ramène à sa place, sans rien recalculer.
    const [thread] = groupReviewThreads([comment({ line: 97, side: "RIGHT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "additions", line: 97 });
    expect(isLineInDiff(HUNKS, "additions", 97)).toBe(false);
  });
});

describe("anchorKey", () => {
  it("sépare les deux côtés d'un même numéro de ligne", () => {
    // En unifié, une ligne modifiée produit DEUX lignes numérotées 150 : la
    // supprimée et l'ajoutée. Elles ne partagent ni annotation ni brouillon.
    expect(anchorKey({ side: "deletions", line: 150 })).not.toBe(
      anchorKey({ side: "additions", line: 150 }),
    );
  });
});

describe("isLineInDiff", () => {
  it("retient les lignes du hunk, des deux côtés", () => {
    expect(isLineInDiff(HUNKS, "additions", 147)).toBe(true);
    expect(isLineInDiff(HUNKS, "additions", 153)).toBe(true);
    expect(isLineInDiff(HUNKS, "deletions", 150)).toBe(true);
  });

  it("EXCLUT ce qui est hors hunk — GitHub le refuse en 422", () => {
    // Ces lignes-là existent dans le fichier et s'affichent une fois le contexte
    // déplié : elles ne sont pour autant PAS dans le diff que la forge connaît.
    expect(isLineInDiff(HUNKS, "additions", 146)).toBe(false);
    expect(isLineInDiff(HUNKS, "additions", 154)).toBe(false);
    expect(isLineInDiff(HUNKS, "additions", 97)).toBe(false);
  });
});

describe("lineKind", () => {
  it("distingue l'ajout, la suppression et le contexte au même numéro", () => {
    expect(lineKind(HUNKS, "additions", 150)).toBe("added");
    expect(lineKind(HUNKS, "deletions", 150)).toBe("removed");
    expect(lineKind(HUNKS, "additions", 148)).toBe("context");
    expect(lineKind(HUNKS, "deletions", 152)).toBe("context");
  });

  it("ne dit rien d'une ligne hors hunk", () => {
    expect(lineKind(HUNKS, "additions", 97)).toBeNull();
  });
});

describe("commentAnchor", () => {
  const range = (over: Partial<Parameters<typeof commentAnchor>[1]> = {}) => ({
    start: 150,
    end: 150,
    side: "additions" as const,
    ...over,
  });

  it("ancre un clic simple sur la ligne visée", () => {
    expect(commentAnchor(HUNKS, range(), { multiLine: true })).toEqual({
      side: "additions",
      line: 150,
    });
  });

  it("refuse une ligne hors diff plutôt que d'offrir un envoi voué au 422", () => {
    expect(commentAnchor(HUNKS, range({ start: 97, end: 97 }), { multiLine: true })).toBeNull();
  });

  it("remet une plage dans l'ordre du fichier, quel que soit le sens du glissement", () => {
    const down = commentAnchor(HUNKS, range({ start: 148, end: 152 }), { multiLine: true });
    const up = commentAnchor(HUNKS, range({ start: 152, end: 148 }), { multiLine: true });
    // GitHub veut `line` = DERNIÈRE ligne et `start_line` = la première.
    expect(down).toEqual({
      side: "additions",
      line: 152,
      startLine: 148,
      startSide: "additions",
    });
    expect(up).toEqual(down);
  });

  it("ramène la plage à sa ligne d'arrivée quand elle change de côté", () => {
    const anchor = commentAnchor(
      HUNKS,
      range({ start: 150, side: "deletions", end: 152, endSide: "additions" }),
      { multiLine: true },
    );
    expect(anchor).toEqual({ side: "additions", line: 152 });
  });

  it("ramène la plage à sa ligne d'arrivée là où les plages n'existent pas (GitLab)", () => {
    const anchor = commentAnchor(HUNKS, range({ start: 148, end: 152 }), { multiLine: false });
    expect(anchor).toEqual({ side: "additions", line: 152 });
  });

  it("refuse une plage dont un bout sort du diff", () => {
    expect(commentAnchor(HUNKS, range({ start: 145, end: 152 }), { multiLine: true })).toEqual({
      side: "additions",
      line: 152,
    });
    expect(commentAnchor(HUNKS, range({ start: 148, end: 160 }), { multiLine: true })).toBeNull();
  });
});

describe("sharedStartLine", () => {
  const thread = (id: number, start: number | null) =>
    groupReviewThreads([comment({ id, line: 15, start_line: start })])[0];

  it("rend la plage quand le seul fil en porte une", () => {
    expect(sharedStartLine([thread(1, 6)])).toBe(6);
  });

  it("ne rend rien pour une remarque d'une seule ligne", () => {
    expect(sharedStartLine([thread(1, null)])).toBeNull();
    expect(sharedStartLine([])).toBeNull();
  });

  it("se tait quand deux fils de la même ligne couvrent des plages différentes", () => {
    // Un seul intitulé ne peut pas dire deux plages : on retombe alors sur la
    // ligne d'ancrage, qui reste vraie pour les deux.
    expect(sharedStartLine([thread(1, 6), thread(2, 9)])).toBeNull();
    expect(sharedStartLine([thread(1, 6), thread(2, null)])).toBeNull();
  });
});
