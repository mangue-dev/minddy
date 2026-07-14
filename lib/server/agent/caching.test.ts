import { describe, expect, it } from "vitest";
import { markSystemPromptCache } from "./caching";

/**
 * Tests du marquage de cache : le système reçoit un breakpoint ephemeral, le
 * reste est intact, et l'entrée n'est jamais mutée (l'historique-checkpoint doit
 * rester en content:string).
 */

describe("markSystemPromptCache", () => {
  it("marque le message système d'un cache breakpoint ephemeral", () => {
    const out = markSystemPromptCache([
      { role: "system", content: "You are numo." },
      { role: "user", content: "do it" },
    ]);
    expect(out[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: "You are numo.", cache_control: { type: "ephemeral" } }],
    });
  });

  it("laisse les messages non-système inchangés", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: null },
      { role: "tool", content: "result", tool_call_id: "a" },
    ];
    const out = markSystemPromptCache(messages);
    expect(out[1]).toEqual({ role: "user", content: "hi" });
    expect(out[2]).toEqual({ role: "assistant", content: null });
    expect(out[3]).toEqual({ role: "tool", content: "result", tool_call_id: "a" });
  });

  it("ignore un système à contenu vide ou null", () => {
    const out = markSystemPromptCache([
      { role: "system", content: "" },
      { role: "system", content: null },
    ]);
    expect(out[0]).toEqual({ role: "system", content: "" });
    expect(out[1]).toEqual({ role: "system", content: null });
  });

  it("ne mute pas le tableau d'entrée (le checkpoint reste string)", () => {
    const messages = [{ role: "system", content: "sys" }];
    markSystemPromptCache(messages);
    expect(messages[0].content).toBe("sys");
  });
});
