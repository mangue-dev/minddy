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

  it("marque la fin du préfixe de seed ET la queue, jamais le milieu", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "task" }, // fin du seed → marqué
      { role: "assistant", content: null },
      { role: "tool", content: "vieux", tool_call_id: "a" },
      { role: "assistant", content: null },
      { role: "tool", content: "result", tool_call_id: "b" }, // queue → marquée
    ];
    const out = markSystemPromptCache(messages) as Array<Record<string, unknown>>;
    // Système marqué.
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
    // Dernier message non-assistant du seed marqué.
    expect(out[1].content).toEqual([{ type: "text", text: "task", cache_control: { type: "ephemeral" } }]);
    // Le milieu de l'historique, lui, ne l'est pas.
    expect(out[2]).toEqual({ role: "assistant", content: null });
    expect(out[3]).toEqual({ role: "tool", content: "vieux", tool_call_id: "a" });
    expect(out[4]).toEqual({ role: "assistant", content: null });
    // Breakpoint GLISSANT (MIN-242) : le dernier message marquable, ici un `tool`.
    // C'est CELUI-LÀ qui cache ce qui grossit — sans lui, la part cachée d'un run
    // décroît de 98 % à 8 % à mesure que la queue s'allonge.
    expect(out[5]).toEqual({
      role: "tool",
      tool_call_id: "b",
      content: [{ type: "text", text: "result", cache_control: { type: "ephemeral" } }],
    });
  });

  it("remonte au-dessus d'un assistant à contenu nul pour poser la queue", () => {
    // Un round finit sur un `assistant` porteur de tool_calls (content: null) :
    // impossible à marquer, donc on marque le dernier résultat en dessous.
    const out = markSystemPromptCache([
      { role: "system", content: "sys" },
      { role: "user", content: "task" },
      { role: "assistant", content: null },
      { role: "tool", content: "result", tool_call_id: "a" },
      { role: "assistant", content: null },
    ] as Parameters<typeof markSystemPromptCache>[0]) as Array<Record<string, unknown>>;
    expect(out[3].content).toEqual([
      { type: "text", text: "result", cache_control: { type: "ephemeral" } },
    ]);
    expect(out[4]).toEqual({ role: "assistant", content: null });
  });

  it("ne pose PAS de troisième breakpoint tant que la queue est dans le seed", () => {
    // Round 0 : le dernier message EST la fin du seed. Deux marqueurs, pas trois —
    // un troisième au même endroit ne couvrirait rien de neuf.
    const out = markSystemPromptCache([
      { role: "system", content: "sys" },
      { role: "user", content: "ctx" },
      { role: "user", content: "task" },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
    // Milieu du seed : jamais marqué (seul le DERNIER l'est).
    expect(out[1]).toEqual({ role: "user", content: "ctx" });
    expect(out[2].content).toEqual([{ type: "text", text: "task", cache_control: { type: "ephemeral" } }]);
  });

  it("saute un contenu multipart en queue (une image, MIN-111) pour le suivant", () => {
    const image = [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }];
    const out = markSystemPromptCache([
      { role: "system", content: "sys" },
      { role: "user", content: "task" },
      { role: "assistant", content: null },
      { role: "tool", content: "result", tool_call_id: "a" },
      { role: "tool", content: image, tool_call_id: "b" },
    ] as Parameters<typeof markSystemPromptCache>[0]) as Array<Record<string, unknown>>;
    // La maquette passe telle quelle…
    expect(out[4]).toEqual({ role: "tool", content: image, tool_call_id: "b" });
    // …et la queue se pose sur le dernier message TEXTE en dessous.
    expect(out[3].content).toEqual([
      { type: "text", text: "result", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("ne marque pas DEUX FOIS le système quand le seed s'y réduit", () => {
    // Seed = le système seul : pas de second breakpoint au même endroit. La queue,
    // elle, reste marquée — c'est un message distinct.
    const out = markSystemPromptCache([
      { role: "system", content: "sys" },
      { role: "assistant", content: "go" },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
    expect(out[1].content).toEqual([{ type: "text", text: "go", cache_control: { type: "ephemeral" } }]);
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
