import { describe, expect, it } from "vitest";

import {
  arrangeThreads,
  commentedBlockIds,
  normalizeQuote,
  resolvedCount,
  type PageComment,
} from "./page-comments";

/**
 * MIN-282 — l'ANCRAGE et le DÉTACHEMENT, la moitié qu'on ne peut pas vérifier à
 * l'œil.
 *
 * Le détachement est un calcul fait à chaque affichage contre le document réel,
 * jamais une écriture : c'est exactement le genre de règle qui a l'air juste
 * dans le code et se trompe d'un cran une fois montée. Et l'erreur ne se voit
 * pas — un fil détaché qui ne remonte pas en tête est un fil que plus rien ne
 * rappelle à personne.
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
    resolved_at: null,
    resolved_by: null,
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
    // Le bloc « b-parti » n'est plus dans le document : le fil ne peut plus se
    // rappeler à personne par la page, donc c'est la liste qui doit le faire.
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
    // Il reste LISIBLE : son extrait figé est la seule trace de ce dont il
    // parlait, et la seule raison de savoir pourquoi le bloc a été retiré.
    expect(threads[0].root.quote).toBe("le passage supprimé");
    expect(threads.slice(1).every((t) => !t.detached)).toBe(true);
  });

  it("un commentaire de PAGE n'est jamais détaché — il n'a rien à perdre", () => {
    const [thread] = arrangeThreads([comment()], blocks());
    expect(thread.anchored).toBe(false);
    expect(thread.detached).toBe(false);
  });

  it("masque les fils résolus, et les rend sur demande", () => {
    const open = comment();
    const done = comment({ resolved_at: "2026-08-11T12:00:00.000Z", resolved_by: "u-bob" });

    expect(arrangeThreads([open, done], blocks()).map((t) => t.root.id)).toEqual([
      open.id,
    ]);
    const all = arrangeThreads([open, done], blocks(), { includeResolved: true });
    expect(all.map((t) => t.root.id)).toEqual([open.id, done.id]);
    expect(all[1].resolved).toBe(true);
    expect(resolvedCount([open, done], blocks())).toBe(1);
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
    // Perdre du texte parce qu'on a perdu son parent est exactement ce que le
    // détachement refuse par ailleurs.
    const orphan = comment({ parent_id: "racine-effacée" });
    expect(arrangeThreads([orphan], blocks()).map((t) => t.root.id)).toEqual([
      orphan.id,
    ]);
  });
});

describe("commentedBlockIds", () => {
  it("n'allume que les blocs qui portent un fil ouvert ET vivant", () => {
    const open = comment({ block_id: "b1" });
    const done = comment({ block_id: "b2", resolved_at: "2026-08-11T12:00:00.000Z" });
    const gone = comment({ block_id: "b-parti" });
    const onPage = comment();

    const threads = arrangeThreads(
      [open, done, gone, onPage],
      blocks("b1", "b2"),
      { includeResolved: true }
    );
    expect([...commentedBlockIds(threads)]).toEqual(["b1"]);
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
