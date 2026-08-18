import { describe, expect, it } from "vitest";
import {
  buildAssistantBlocks,
  copyableMessageIds,
  type AssistantTurn,
} from "./assistant-turns";
import type { AssistantMessage, AssistantToolCall } from "./assistant-types";

/**
 * Reading the Numo thread in ROUNDS. What's locked in here is the promise
 * to the reader: as Numo works he sees the work, and at the end
 * he sees THE ANSWER — never all the way around a block, and never text that jumps from place to place as the stream progresses.
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
    // The final text has just been received but the loop is still turning: there remains
    // UNDER the accordion, exactly where it was displayed in streaming — otherwise it
    // would jump into the rollout and then come out at the end of the turn.
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
    // A round in flight (tool gone, or text being written): the text received
    // just before is no longer the tail of the turn, it cannot remain displayed under
    // a more recent job than him.
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
    // The user message is rendered as a block BROTHER of the round: two React children of
    // same key, and React duplicates or omits nodes.
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
    // MIN-173: the check card lives on this message. Folded in the unfolded state,
    // she would be hidden behind a closed accordion - but it is she who is
    // waits, and nothing exists until it has been validated.
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
    // Sending canceled during a tool: there is no response to put forward,
    // we do not hide the little work produced behind a closed accordion.
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
 * The “Copy” button follows THE REPLY, not the messages. What is folded in
 * the accordion is intermediate work: we do not take it.
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
    // Narration already written, but a tool left: this text is work
    // in progress, not a response — it doesn't have a copy button.
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
    // Round finished, tools running: nothing is in flight anymore, so
    // the narration finds itself in a position of response — provisionally. Without this
    // safeguard, the button was placed in turn under EACH last message
    // throughout Numo's work.
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
