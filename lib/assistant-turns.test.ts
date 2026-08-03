import { describe, expect, it } from "vitest";
import {
  buildAssistantBlocks,
  copyableMessageIds,
  type AssistantTurn,
} from "./assistant-turns";
import type { AssistantMessage, AssistantToolCall } from "./assistant-types";

/**
 * Lecture du fil Numo en TOURS. Ce qui est verrouillé ici, c'est la promesse
 * faite au lecteur : pendant que Numo travaille il voit le travail, et à la fin
 * il voit LA RÉPONSE — jamais tout le tour d'un bloc, et jamais un texte qui
 * saute d'un endroit à l'autre au fil du stream.
 */

function msg(
  id: string,
  role: AssistantMessage["role"],
  content: string | null,
  extra: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id,
    conversation_id: "c1",
    role,
    content,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    created_at: "2026-07-26T10:00:00.000Z",
    ...extra,
  };
}

function call(name: string, id = name): AssistantToolCall {
  return { id, type: "function", function: { name, arguments: "{}" } };
}

const turns = (blocks: ReturnType<typeof buildAssistantBlocks>) =>
  blocks.filter((b): b is AssistantTurn => b.kind === "turn");

describe("buildAssistantBlocks", () => {
  it("laisse une réponse directe telle quelle (aucun accordéon à ouvrir)", () => {
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "salut"),
      msg("a1", "assistant", "Bonjour !"),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["message", "message"]);
  });

  it("replie le travail du tour et garde la réponse finale dehors", () => {
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "crée un ticket"),
      msg("a1", "assistant", "Je m'en occupe.", { tool_calls: [call("create_issue")] }),
      msg("t1", "tool", "{}", { tool_call_id: "create_issue" }),
      msg("a2", "assistant", "C'est créé : MIN-42."),
    ]);
    const [turn] = turns(blocks);
    expect(turn.work.map((m) => m.id)).toEqual(["a1"]);
    expect(turn.summary?.id).toBe("a2");
    expect(turn.active).toBe(false);
  });

  it("garde les messages utilisateur visibles et sépare les tours", () => {
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "un"),
      msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
      msg("a2", "assistant", "Voilà."),
      msg("u2", "user", "deux"),
      msg("a3", "assistant", null, { tool_calls: [call("list_issues", "c2")] }),
      msg("a4", "assistant", "Voilà aussi."),
    ]);
    expect(blocks.map((b) => (b.kind === "message" ? b.message.id : "turn"))).toEqual([
      "u1",
      "turn",
      "u2",
      "turn",
    ]);
  });

  it("chronomètre le tour de l'envoi de l'utilisateur à la réponse", () => {
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "vas-y", { created_at: "2026-07-26T10:00:00.000Z" }),
      msg("a1", "assistant", null, {
        tool_calls: [call("list_issues")],
        created_at: "2026-07-26T10:00:04.000Z",
      }),
      msg("a2", "assistant", "Fini.", { created_at: "2026-07-26T10:00:09.000Z" }),
    ]);
    const [turn] = turns(blocks);
    expect(turn.startedAt).toBe("2026-07-26T10:00:00.000Z");
    expect(turn.endedAt).toBe("2026-07-26T10:00:09.000Z");
  });

  it("laisse le chrono courir sur le tour actif, réponse en cours déjà dehors", () => {
    // Le texte final vient d'être reçu mais la boucle tourne encore : il reste
    // SOUS l'accordéon, exactement là où il s'affichait en streaming — sinon il
    // sauterait dans le déroulé puis en ressortirait à la fermeture du tour.
    const blocks = buildAssistantBlocks(
      [
        msg("u1", "user", "vas-y"),
        msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
        msg("a2", "assistant", "Voilà le résultat."),
      ],
      { active: true },
    );
    const [turn] = turns(blocks);
    expect(turn.active).toBe(true);
    expect(turn.endedAt).toBeNull();
    expect(turn.work.map((m) => m.id)).toEqual(["a1"]);
    expect(turn.summary?.id).toBe("a2");
  });

  it("renvoie la narration dans le déroulé dès que le tour repart", () => {
    // Un round en vol (outil parti, ou texte en train de s'écrire) : le texte reçu
    // juste avant n'est plus la queue du tour, il ne peut pas rester affiché sous
    // un travail plus récent que lui.
    const blocks = buildAssistantBlocks(
      [
        msg("u1", "user", "vas-y"),
        msg("a1", "assistant", "Je regarde les tickets…", {
          tool_calls: [call("list_issues")],
        }),
      ],
      { active: true, pendingWork: true },
    );
    const [turn] = turns(blocks);
    expect(turn.work.map((m) => m.id)).toEqual(["a1"]);
    expect(turn.summary).toBeNull();
  });

  it("ouvre un tour actif même sans rien produit encore (chrono du travail en cours)", () => {
    const blocks = buildAssistantBlocks([msg("u1", "user", "vas-y")], {
      active: true,
    });
    const [turn] = turns(blocks);
    expect(turn.work).toEqual([]);
    expect(turn.summary).toBeNull();
  });

  it("ne réutilise pas l'id du message qui ouvre le tour comme clé", () => {
    // Le message user est rendu en bloc FRÈRE du tour : deux enfants React de
    // même clé, et React duplique ou omet des nœuds.
    const blocks = buildAssistantBlocks(
      [msg("u1", "user", "vas-y"), msg("a1", "assistant", "Voilà.")],
      { active: true, pendingWork: true },
    );
    const keys = blocks.map((b) => (b.kind === "message" ? b.message.id : b.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("garde la même clé du tour actif au tour terminé (fermeture animée)", () => {
    const history = [
      msg("u1", "user", "vas-y"),
      msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
    ];
    const during = turns(buildAssistantBlocks(history, { active: true }))[0];
    const after = turns(
      buildAssistantBlocks([...history, msg("a2", "assistant", "Fini.")]),
    )[0];
    expect(during.key).toBe(after.key);
  });

  it("traite une question ask_user comme la fin du tour", () => {
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "range mes tickets"),
      msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
      msg("a2", "assistant", null, { tool_calls: [call("ask_user")] }),
    ]);
    const [turn] = turns(blocks);
    expect(turn.work.map((m) => m.id)).toEqual(["a1"]);
    expect(turn.summary?.id).toBe("a2");
  });

  it("traite une proposition d'amorce comme la fin du tour", () => {
    // MIN-173 : la carte à cocher vit sur ce message. Repliée dans le déroulé,
    // elle serait cachée derrière un accordéon fermé — or c'est elle qu'on
    // attend, et rien n'existe tant qu'elle n'a pas été validée.
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "aide-moi à démarrer ce projet"),
      msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
      msg("a2", "assistant", null, { tool_calls: [call("propose_backlog")] }),
    ]);
    const [turn] = turns(blocks);
    expect(turn.work.map((m) => m.id)).toEqual(["a1"]);
    expect(turn.summary?.id).toBe("a2");
  });

  it("affiche tel quel un tour interrompu avant sa réponse", () => {
    // Envoi annulé pendant un outil : il n'y a pas de réponse à mettre en avant,
    // on ne cache pas le peu de travail produit derrière un accordéon fermé.
    const blocks = buildAssistantBlocks([
      msg("u1", "user", "vas-y"),
      msg("a1", "assistant", null, { tool_calls: [call("list_issues")] }),
    ]);
    expect(blocks.map((b) => (b.kind === "message" ? b.message.id : "turn"))).toEqual([
      "u1",
      "turn",
    ]);
    expect(turns(blocks)[0].work.map((m) => m.id)).toEqual(["a1"]);
  });

  it("ignore les messages tool et system", () => {
    const blocks = buildAssistantBlocks([
      msg("s1", "system", "prompt"),
      msg("u1", "user", "salut"),
      msg("t1", "tool", "{}", { tool_call_id: "x" }),
      msg("a1", "assistant", "Bonjour !"),
    ]);
    expect(blocks.map((b) => (b.kind === "message" ? b.message.id : "turn"))).toEqual([
      "u1",
      "a1",
    ]);
  });

  it("ne produit rien sur une conversation vide", () => {
    expect(buildAssistantBlocks([])).toEqual([]);
  });
});

/**
 * Le bouton « Copier » suit LA RÉPONSE, pas les messages. Ce qui est plié dans
 * l'accordéon est du travail intermédiaire : on ne l'emporte pas.
 */
describe("copyableMessageIds", () => {
  const ids = (messages: AssistantMessage[], active = false) =>
    copyableMessageIds(
      buildAssistantBlocks(messages, { active, pendingWork: active }),
    );

  it("ne marque que la réponse du tour, jamais le travail replié", () => {
    const got = ids([
      msg("u1", "user", "crée un ticket"),
      msg("a1", "assistant", "Je m'en occupe.", {
        tool_calls: [call("create_issue")],
      }),
      msg("t1", "tool", "{}", { tool_call_id: "create_issue" }),
      msg("a2", "assistant", "C'est créé : MIN-42."),
    ]);
    expect([...got]).toEqual(["a2"]);
  });

  it("marque la réponse directe, qui n'a rien à replier", () => {
    const got = ids([
      msg("u1", "user", "salut"),
      msg("a1", "assistant", "Bonjour !"),
    ]);
    expect([...got]).toEqual(["a1"]);
  });

  it("ne marque rien tant que le tour travaille", () => {
    // Narration déjà écrite, mais un outil est reparti : ce texte est du travail
    // en cours, pas une réponse — il ne porte pas de bouton copier.
    const got = ids(
      [
        msg("u1", "user", "vas-y"),
        msg("a1", "assistant", "Je regarde les tickets…"),
      ],
      true,
    );
    expect([...got]).toEqual([]);
  });

  it("ne marque pas non plus la queue d'un tour actif entre deux rounds", () => {
    // Round terminé, outils en cours d'exécution : plus rien n'est en vol, donc
    // la narration se retrouve en position de réponse — provisoirement. Sans ce
    // garde-fou, le bouton se posait tour à tour sous CHAQUE dernier message
    // pendant tout le travail de Numo.
    const got = copyableMessageIds(
      buildAssistantBlocks(
        [
          msg("u1", "user", "vas-y"),
          msg("a1", "assistant", "Je regarde les tickets…", {
            tool_calls: [call("list_issues")],
          }),
        ],
        { active: true, pendingWork: false },
      ),
    );
    expect([...got]).toEqual([]);
  });

  it("marque la réponse une fois le tour terminé", () => {
    const got = ids([
      msg("u1", "user", "vas-y"),
      msg("a1", "assistant", "Je regarde…", { tool_calls: [call("list_issues")] }),
      msg("a2", "assistant", "Voilà."),
    ]);
    expect([...got]).toEqual(["a2"]);
  });

  it("ne marque jamais un message utilisateur", () => {
    const got = ids([msg("u1", "user", "salut")]);
    expect([...got]).toEqual([]);
  });
});
