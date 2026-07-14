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

  it("marque AUSSI la fin du préfixe de seed, mais rien après le premier assistant", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "task" }, // fin du seed → marqué
      { role: "assistant", content: null },
      { role: "tool", content: "result", tool_call_id: "a" },
    ];
    const out = markSystemPromptCache(messages) as Array<Record<string, unknown>>;
    // Système marqué.
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
    // Dernier message non-assistant du seed marqué.
    expect(out[1].content).toEqual([{ type: "text", text: "task", cache_control: { type: "ephemeral" } }]);
    // Rien après le premier assistant n'est touché.
    expect(out[2]).toEqual({ role: "assistant", content: null });
    expect(out[3]).toEqual({ role: "tool", content: "result", tool_call_id: "a" });
  });

  it("ne marque qu'un breakpoint quand le seed = le système seul", () => {
    const out = markSystemPromptCache([
      { role: "system", content: "sys" },
      { role: "assistant", content: "go" },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
    expect(out[1]).toEqual({ role: "assistant", content: "go" });
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
