import { describe, expect, it } from "vitest";
import { unechoedMessages } from "./agent-pending";

/**
 * Bulles optimistes de la conversation de l'agent. Ce qui est verrouillé ici, c'est
 * le cycle de vie complet d'un message de follow-up : il apparaît À L'ENVOI, reste
 * visible tant que la boucle ne l'a pas drainé, et disparaît PILE quand son écho
 * arrive — sans doublon, et sans se faire avaler par un message identique plus vieux.
 */

describe("unechoedMessages", () => {
  it("affiche le message dès l'envoi, avant tout écho serveur", () => {
    // Le scénario réel : session au repos (l'agent vient de répondre), l'utilisateur
    // envoie un follow-up. Le fil ne contient que le prompt de lancement et la
    // réponse ; le nouveau message n'est pas encore un event.
    expect(unechoedMessages(["ajoute des tests"], ["Travaille sur MIN-68"])).toEqual([
      "ajoute des tests",
    ]);
  });

  it("retire la bulle quand son écho arrive (aucun doublon)", () => {
    expect(
      unechoedMessages(["ajoute des tests"], ["Travaille sur MIN-68", "ajoute des tests"]),
    ).toEqual([]);
  });

  it("garde DEUX bulles pour deux envois identiques, et n'en retire qu'une par écho", () => {
    // Le cas qui casse un simple « ce texte existe-t-il déjà ? » : sans compter, le
    // 1er écho ferait disparaître les deux bulles d'un coup.
    expect(unechoedMessages(["continue", "continue"], [])).toEqual(["continue", "continue"]);
    expect(unechoedMessages(["continue", "continue"], ["continue"])).toEqual(["continue"]);
    expect(unechoedMessages(["continue", "continue"], ["continue", "continue"])).toEqual([]);
  });

  it("ne se laisse pas avaler par un message identique DÉJÀ échoué plus tôt", () => {
    // « ok » envoyé au tour 1 (déjà échoué), puis « ok » de nouveau au tour 2. La
    // liste `pending` n'étant jamais purgée, elle porte les deux : la soustraction
    // laisse bien la nouvelle bulle.
    expect(unechoedMessages(["ok", "ok"], ["ok"])).toEqual(["ok"]);
  });

  it("ignore les espaces de bord (l'écho est normalisé côté serveur)", () => {
    expect(unechoedMessages(["  relance  "], ["relance"])).toEqual([]);
  });

  it("n'affiche rien quand rien n'a été envoyé", () => {
    expect(unechoedMessages([], ["Travaille sur MIN-68"])).toEqual([]);
  });

  it("laisse passer un envoi qui n'a rien à voir avec les échos", () => {
    expect(unechoedMessages(["b"], ["a", "c"])).toEqual(["b"]);
  });
});

/**
 * PR 52 — LES MENTIONS VOYAGENT AVEC LEUR MESSAGE.
 *
 * Un message en attente ne porte pas que du texte : il porte les ids de ce qu'il
 * cite. Les retrouver après coup par égalité de texte donnait les pilules du
 * premier « ok » au second — celui qui citait un ticket.
 */
describe("les objets en attente, pas leurs textes", () => {
  it("rend le message ENTIER, mentions comprises", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    expect(unechoedMessages(pending, [])).toEqual(pending);
  });

  it("ne consomme QU'UN homonyme par écho, et garde le bon", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    // Le premier « ok » est revenu du serveur : c'est LUI qui part, et celui qui
    // reste garde ses mentions.
    expect(unechoedMessages(pending, ["ok"])).toEqual([pending[1]]);
  });
});
