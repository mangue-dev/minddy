import { describe, expect, it } from "vitest";

import { buildBlocks } from "./agent-feed-blocks";
import type { FeedItem } from "@/components/agent/agent-event-feed";

/**
 * LE DÉCOUPAGE DU FIL EN TOURS : ce qui ouvre un tour, ce qui le referme, et ce qui
 * ne fait que se poser dessous. Un tour = un accordéon = UN chrono à l'écran, et
 * c'est cette dernière égalité que la suite garde (elle s'est déjà cassée : la liste
 * de fichiers en direct fabriquait un second accordéon sous la réponse).
 */

const T = "2026-08-13T10:00:00.000Z";

function message(id: string, opts: { summary?: boolean; user?: boolean } = {}): FeedItem {
  return {
    kind: "message",
    message: {
      id,
      conversation_id: "",
      role: opts.user ? "user" : "assistant",
      content: id,
      tool_calls: null,
      tool_call_id: null,
      tool_name: null,
      metadata: {},
      created_at: "",
    },
    createdAt: T,
    isSummary: opts.summary,
  };
}

function files(id: string, live?: boolean): FeedItem {
  return {
    kind: "files",
    id,
    files: [{ path: "lib/a.ts", status: "modified", additions: 0, deletions: 0 }],
    truncated: false,
    createdAt: T,
    live,
  };
}

/** La note de MIN-358 : le commit du tour a emporté des fichiers de l'humain. */
function overlap(id: string, count = 1): FeedItem {
  return { kind: "note", id, variant: "currentRepoOverlap", count, text: "", createdAt: T };
}

const reasoning: FeedItem = {
  kind: "reasoning",
  id: "r1",
  active: true,
  durationMs: 1200,
  text: "",
  createdAt: T,
};

const turns = (blocks: ReturnType<typeof buildBlocks>) => blocks.filter((b) => b.type === "turn");

describe("buildBlocks", () => {
  it("replie le travail d'un tour dans UN bloc, sa réponse dessous", () => {
    const blocks = buildBlocks([reasoning, message("answer", { summary: true })], false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, work: [reasoning] });
  });

  it("n'ouvre PAS un second tour sur la liste de fichiers vivante qui suit la réponse", () => {
    // Le cas du bug : le direct ne lâche la liste qu'au `files_changed` de fin de
    // tour, donc elle arrive derrière le résumé. Rangée comme un tour neuf, elle
    // affichait un DEUXIÈME accordéon sous la réponse, avec son propre chrono.
    const blocks = buildBlocks(
      [reasoning, message("answer", { summary: true }), files("live-files", true)],
      true,
    );
    expect(turns(blocks)).toHaveLength(1);
    expect(blocks[blocks.length - 1]).toEqual({ type: "loose", item: files("live-files", true) });
  });

  it("le bloc de fichiers de FIN de tour se range sous la réponse de ce tour", () => {
    const blocks = buildBlocks(
      [reasoning, message("answer", { summary: true }), files("f1")],
      false,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", files: [files("f1")] });
  });

  it("un tour EN COURS reste actif tant qu'il a du vrai travail", () => {
    const blocks = buildBlocks([reasoning, files("live-files", true)], true);
    expect(turns(blocks)).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: true, endedAt: null });
  });

  it("un tour arrêté sans conclure garde son accordéon, marqué interrompu", () => {
    const blocks = buildBlocks([reasoning], false);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, interrupted: true });
  });

  it("un message user sépare les tours : le travail non résumé se déverse déplié", () => {
    const blocks = buildBlocks(
      [reasoning, message("u1", { user: true }), message("answer", { summary: true })],
      false,
    );
    // Le tour mis en pause n'a pas conclu : il reste déplié, et seul ce qui suit le
    // message user forme le tour suivant — ici une réponse seule, donc libre aussi.
    expect(blocks.map((b) => b.type)).toEqual(["loose", "loose", "loose"]);
  });
});

/**
 * MIN-293 — LE TOUR FANTÔME « INTERROMPU », vu sur un vrai run local.
 *
 * `current_repo_overlap` (MIN-358) arrive APRÈS le résumé, comme `files_changed`.
 * Tant qu'il n'était pas reconnu comme une conclusion de tour, il comptait pour du
 * TRAVAIL : il rouvrait un tour à lui tout seul, que rien ne refermait jamais, et
 * le fil affichait « Tour interrompu » sous un tour qui venait de réussir.
 *
 * Le défaut ne se voyait qu'en mode dépôt courant — donc uniquement sur un run
 * local, ce qui explique qu'il ait traversé toute la suite sans être vu.
 */
describe("ce qui arrive APRÈS le résumé se range sous le tour", () => {
  it("ne fabrique PAS un second tour « interrompu » sur un chevauchement", () => {
    // La séquence exacte du run f1be4a59 : travail, résumé, chevauchement, fichiers.
    const blocks = buildBlocks(
      [reasoning, message("summary", { summary: true }), overlap("ov"), files("fc")],
      false,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false });
    expect(blocks[0]).not.toHaveProperty("interrupted", true);
  });

  it("range le chevauchement SOUS la réponse, avec les fichiers changés", () => {
    const blocks = buildBlocks(
      [reasoning, message("summary", { summary: true }), overlap("ov"), files("fc")],
      false,
    );
    const turn = blocks[0] as Extract<ReturnType<typeof buildBlocks>[number], { type: "turn" }>;
    expect(
      turn.files.map((f) => (f.kind === "note" ? f.variant : f.kind)),
    ).toEqual(["currentRepoOverlap", "files"]);
  });

  it("laisse un chevauchement ORPHELIN en item libre, sans inventer de tour", () => {
    // Aucun tour devant lui (rechargement au milieu du fil) : il se montre tel
    // quel plutôt que d'ouvrir un accordéon vide.
    const blocks = buildBlocks([overlap("ov")], false);
    expect(blocks).toEqual([{ type: "loose", item: overlap("ov") }]);
  });

  it("garde « interrompu » sur un vrai tour coupé — la ligne sert encore", () => {
    // Ce que le correctif ne doit pas emporter : un tour arrêté sans réponse dit
    // toujours pourquoi la réponse manque.
    const blocks = buildBlocks([reasoning], false);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, interrupted: true });
  });
});
