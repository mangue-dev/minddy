import { describe, expect, it } from "vitest";

import {
  arrangeThreads,
  commentedBlockCounts,
  normalizeQuote,
  type PageComment,
} from "./page-comments";

/**
 * MIN-282 — ANCHORING and DETACHING, the half that cannot be checked by eye.
 *
 * Detachment is a calculation made each time it is displayed against the real document,
 * never a writing: this is exactly the kind of rule that looks right
 * in the code and goes one step wrong when mounted. And the error is not visible - a detached thread that does not go to the top is a thread that nothing reminds anyone of.
 */

let seq = 0;
const comment = (over: Partial<PageComment> = {}): PageComment => {
  seq += 1;
  return {
    id: `c${seq}`,
    page_id: "page-1",
    project_id: "p1",
    block_id: null,
    quote: null,
    body: "…",
    author_id: "u-clement",
    parent_id: null,
    created_at: `2026-08-1${seq}T10:00:00.000Z`,
    updated_at: `2026-08-1${seq}T10:00:00.000Z`,
    ...over,
  };
};

const blocks = (...ids: string[]) => new Set(ids);

describe("arrangeThreads", () => {
  it("retrouve son bloc : ancré et vivant tant que le bloc est là", () => {
    const root = comment({ block_id: "b1", quote: "cette phrase-là" });
    const [thread] = arrangeThreads([root], blocks("b1"));
    expect(thread.anchored).toBe(true);
    expect(thread.detached).toBe(false);
    expect(thread.root.quote).toBe("cette phrase-là");
  });

  it("détache le fil dont le bloc a disparu, et le remonte EN TÊTE", () => {
    // The “b-parti” block is no longer in the document: the thread can no longer be
    // remind no one by the page, so the list should do it.
    const page = comment({ created_at: "2026-08-01T10:00:00.000Z" });
    const orphaned = comment({
      block_id: "b-parti",
      quote: "le passage supprimé",
      created_at: "2026-08-09T10:00:00.000Z",
    });
    const alive = comment({ block_id: "b1", created_at: "2026-08-05T10:00:00.000Z" });

    const threads = arrangeThreads([page, orphaned, alive], blocks("b1"));
    expect(threads.map((t) => t.root.id)).toEqual([orphaned.id, page.id, alive.id]);
    expect(threads[0].detached).toBe(true);
    // It remains READABLE: its frozen extract is the only trace of what it
    // was talking, and the only reason why the block was removed.
    expect(threads[0].root.quote).toBe("le passage supprimé");
    expect(threads.slice(1).every((t) => !t.detached)).toBe(true);
  });

  it("un commentaire de PAGE n'est jamais détaché — il n'a rien à perdre", () => {
    const [thread] = arrangeThreads([comment()], blocks());
    expect(thread.anchored).toBe(false);
    expect(thread.detached).toBe(false);
  });

  it("range les réponses sous leur racine, dans l'ordre", () => {
    const root = comment();
    const second = comment({
      parent_id: root.id,
      created_at: "2026-08-20T10:00:00.000Z",
    });
    const first = comment({
      parent_id: root.id,
      created_at: "2026-08-15T10:00:00.000Z",
    });
    const [thread] = arrangeThreads([root, second, first], blocks());
    expect(thread.replies.map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("une réponse ORPHELINE redevient une racine plutôt que de disparaître", () => {
    // Losing text because you lost your parent is exactly what
    // detachment otherwise refuses.
    const orphan = comment({ parent_id: "racine-effacée" });
    expect(arrangeThreads([orphan], blocks()).map((t) => t.root.id)).toEqual([
      orphan.id,
    ]);
  });
});

describe("commentedBlockCounts", () => {
  it("n'allume que les blocs VIVANTS — pas la page, pas un bloc parti", () => {
    const open = comment({ block_id: "b1" });
    const gone = comment({ block_id: "b-parti" });
    const onPage = comment();

    const threads = arrangeThreads([open, gone, onPage], blocks("b1"));
    expect([...commentedBlockCounts(threads)]).toEqual([["b1", 1]]);
  });

  it("compte les RÉPONSES : la pastille dit la taille de la discussion", () => {
    // Without them, a block where three people answer each other carries “1”, and the
    // number is no longer used to decide if it's worth the click.
    const root = comment({ block_id: "b1" });
    const replies = [
      comment({ block_id: null, parent_id: root.id }),
      comment({ block_id: null, parent_id: root.id }),
    ];
    const threads = arrangeThreads([root, ...replies], blocks("b1"));
    expect(commentedBlockCounts(threads).get("b1")).toBe(3);
  });
});

describe("normalizeQuote", () => {
  it("replie l'extrait sur une ligne", () => {
    expect(normalizeQuote("  deux   lignes\n  collées ")).toBe("deux lignes collées");
  });

  it("coupe net, avec son ellipse", () => {
    const long = "a".repeat(400);
    const cut = normalizeQuote(long) as string;
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBe(301);
  });

  it("rend null sur du vide — une ancre sans citation reste une ancre", () => {
    expect(normalizeQuote("   ")).toBeNull();
    expect(normalizeQuote(null)).toBeNull();
  });
});
