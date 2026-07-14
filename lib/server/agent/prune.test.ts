import { describe, expect, it } from "vitest";
import { pruneToolOutputs, headTail, PRUNE_STUB } from "./prune";

describe("headTail", () => {
  it("laisse une chaîne courte intacte", () => {
    expect(headTail("hello", 100)).toBe("hello");
  });
  it("garde début ET fin quand ça dépasse", () => {
    const s = "A".repeat(100) + "B".repeat(100);
    const out = headTail(s, 80);
    expect(out).toMatch(/^A+/); // début préservé
    expect(out).toMatch(/B+$/); // fin préservée
    expect(out).toContain("elided");
    expect(out.length).toBeLessThan(s.length);
  });
});

/**
 * Tests de l'élagage des sorties de tools. On vérifie : protection de la fenêtre
 * récente, seuil minimum (pas de churn), préservation du pairing tool_call_id et
 * des messages non-tool, idempotence.
 */

type Msg = { role: string; content?: string | null; tool_call_id?: string };

const tool = (id: string, bytes: number): Msg => ({
  role: "tool",
  tool_call_id: id,
  content: "x".repeat(bytes),
});

describe("pruneToolOutputs", () => {
  it("n'élague rien quand le récupérable est sous le minimum", () => {
    const messages: Msg[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "do it" },
      tool("a", 30), // ancien, mais petit
      { role: "assistant", content: "thinking" },
      tool("b", 100), // récent (protégé)
    ];
    const before = messages.map((m) => m.content);
    const reclaimed = pruneToolOutputs(messages, { protectBytes: 100, minimumBytes: 50 });
    expect(reclaimed).toBe(0);
    expect(messages.map((m) => m.content)).toEqual(before);
  });

  it("élague les sorties anciennes, protège la fenêtre récente", () => {
    const messages: Msg[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "do it" },
      { role: "assistant", content: null },
      tool("old1", 80),
      tool("old2", 80),
      { role: "assistant", content: "thinking" },
      tool("recent", 100),
    ];
    const reclaimed = pruneToolOutputs(messages, { protectBytes: 100, minimumBytes: 50 });

    expect(reclaimed).toBe(160);
    expect(messages[3].content).toBe(PRUNE_STUB); // old1 élagué
    expect(messages[4].content).toBe(PRUNE_STUB); // old2 élagué
    expect(messages[6].content).toBe("x".repeat(100)); // recent intact
    // Pairing préservé.
    expect(messages[3].tool_call_id).toBe("old1");
    expect(messages[4].tool_call_id).toBe("old2");
    // Messages non-tool intacts.
    expect(messages[0].content).toBe("sys");
    expect(messages[5].content).toBe("thinking");
  });

  it("ne touche jamais les messages non-tool", () => {
    const messages: Msg[] = [
      { role: "user", content: "y".repeat(500) },
      { role: "assistant", content: "z".repeat(500) },
      tool("a", 200),
      tool("b", 200),
    ];
    pruneToolOutputs(messages, { protectBytes: 10, minimumBytes: 10 });
    expect(messages[0].content).toBe("y".repeat(500));
    expect(messages[1].content).toBe("z".repeat(500));
  });

  it("est idempotent (les stubs ne sont pas ré-comptés)", () => {
    const messages: Msg[] = [
      tool("old", 100),
      { role: "assistant", content: "t" },
      tool("recent", 50),
    ];
    const first = pruneToolOutputs(messages, { protectBytes: 50, minimumBytes: 10 });
    expect(first).toBe(100);
    expect(messages[0].content).toBe(PRUNE_STUB);

    const second = pruneToolOutputs(messages, { protectBytes: 50, minimumBytes: 10 });
    expect(second).toBe(0);
    expect(messages[0].content).toBe(PRUNE_STUB);
  });
});
