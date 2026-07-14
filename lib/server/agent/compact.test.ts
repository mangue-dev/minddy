import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  planCompaction,
  dropOldestRound,
  serializeForSummary,
  type CompactMessage,
} from "./compact";

/**
 * Tests de la compaction. L'essentiel : l'INVARIANT de sûreté — un plan de
 * compaction ne casse jamais l'appariement assistant(tool_calls) ↔ résultats.
 */

const sys = (): CompactMessage => ({ role: "system", content: "You are numo." });
const usr = (text: string): CompactMessage => ({ role: "user", content: text });
const asst = (text: string, callIds: string[] = []): CompactMessage => ({
  role: "assistant",
  content: text || null,
  tool_calls: callIds.length
    ? callIds.map((id) => ({ id, type: "function", function: { name: "read_file", arguments: "{}" } }))
    : undefined,
});
const toolRes = (id: string, bytes: number): CompactMessage => ({
  role: "tool",
  tool_call_id: id,
  content: "x".repeat(bytes),
});

/** Un historique multi-rounds réaliste (rounds complets assistant→tools). */
function history(): CompactMessage[] {
  return [
    sys(),
    usr("Implement the feature."),
    asst("Let me read the files.", ["a1"]),
    toolRes("a1", 300),
    asst("Now searching.", ["a2"]),
    toolRes("a2", 400),
    asst("Editing.", ["a3", "a4"]),
    toolRes("a3", 200),
    toolRes("a4", 500),
    asst("Running tests.", ["a5"]),
    toolRes("a5", 600),
    asst("All green, finishing."),
  ];
}

/** Vérifie qu'aucun tool_call n'est orphelin et que chaque assistant porteur de
    tool_calls est immédiatement suivi de ses résultats, dans l'ordre. */
function pairingValid(msgs: CompactMessage[]): boolean {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "assistant" && m.tool_calls?.length) {
      const ids = m.tool_calls.map((t) => t.id);
      for (let j = 0; j < ids.length; j++) {
        const r = msgs[i + 1 + j];
        if (!r || r.role !== "tool" || r.tool_call_id !== ids[j]) return false;
      }
      i += ids.length;
    } else if (m.role === "tool") {
      return false; // résultat orphelin
    }
  }
  return true;
}

describe("estimateTokens", () => {
  it("compte contenu + arguments des tool_calls (proxy /4)", () => {
    const msgs: CompactMessage[] = [
      { role: "user", content: "a".repeat(40) }, // 40
      { role: "assistant", content: "b".repeat(40), tool_calls: [{ id: "x", type: "function", function: { name: "read_file", arguments: "c".repeat(80) } }] }, // 40 + 80 + 9 (name)
    ];
    // (40 + 40 + 80 + "read_file".length=9) / 4 = 169/4 = 43 (ceil)
    expect(estimateTokens(msgs)).toBe(Math.ceil((40 + 40 + 80 + 9) / 4));
  });
});

describe("planCompaction — sûreté (invariant d'appariement)", () => {
  it("la queue ne commence jamais par un tool, et l'appariement reste valide", () => {
    for (const keepRecentBytes of [10, 50, 200, 700, 1500, 5000]) {
      const plan = planCompaction(history(), { keepRecentBytes });
      if (!plan) continue;
      expect(plan.tail[0].role).not.toBe("tool");
      expect(pairingValid(plan.tail)).toBe(true);
      expect(pairingValid(plan.toSummarize)).toBe(true);
      const rebuilt: CompactMessage[] = [
        ...plan.seedPrefix,
        { role: "user", content: "summary" },
        ...plan.tail,
      ];
      expect(pairingValid(rebuilt)).toBe(true);
    }
  });

  it("préserve le seed VERBATIM (système + message de tâche) hors résumé", () => {
    const plan = planCompaction(history(), { keepRecentBytes: 200 });
    // Seed = les messages non-assistant en tête (système + premier user).
    expect(plan?.seedPrefix.map((m) => m.role)).toEqual(["system", "user"]);
    expect(plan?.seedPrefix[1].content).toBe("Implement the feature.");
    // Le bloc à résumer ne contient ni le système ni le message de tâche.
    expect(plan?.toSummarize.some((m) => m.role === "system")).toBe(false);
    expect(plan?.toSummarize.some((m) => m.content === "Implement the feature.")).toBe(false);
  });

  it("gère un historique sans message système", () => {
    const h = history().slice(1); // retire le système
    const plan = planCompaction(h, { keepRecentBytes: 200 });
    // Le seed commence par le premier user (pas de système).
    expect(plan?.seedPrefix[0].role).toBe("user");
    if (plan) expect(pairingValid(plan.tail)).toBe(true);
  });

  it("s'abstient (null) quand il y a trop peu à résumer", () => {
    const plan = planCompaction([sys(), usr("hi"), asst("done")], { keepRecentBytes: 10 });
    expect(plan).toBeNull();
  });
});

describe("dropOldestRound — élagage sûr du round le plus ancien", () => {
  it("retire le round le plus ancien en préservant l'appariement", () => {
    const h = history();
    const before = h.length;
    expect(dropOldestRound(h)).toBe(true);
    expect(h.length).toBeLessThan(before);
    expect(pairingValid(h)).toBe(true);
    // Le premier round (assistant a1 + résultat a1) a disparu.
    expect(h.find((m) => m.tool_calls?.some((t) => t.id === "a1"))).toBeUndefined();
    expect(h.find((m) => m.role === "tool" && m.tool_call_id === "a1")).toBeUndefined();
    // Le round suivant (a2) est désormais en tête de corps.
    expect(h[2].tool_calls?.[0]?.id).toBe("a2");
  });

  it("préserve le seed (système + premier user) et l'appariement à chaque élagage", () => {
    const h = history();
    for (let i = 0; i < 12; i++) {
      const ok = dropOldestRound(h);
      expect(h[0].role).toBe("system");
      expect(h[1].role).toBe("user");
      expect(h[1].content).toBe("Implement the feature.");
      expect(pairingValid(h)).toBe(true);
      if (!ok) break;
    }
    // Tout est élagué sauf le seed inviolable.
    expect(h).toEqual([sys(), usr("Implement the feature.")]);
  });

  it("retourne false et ne mute rien quand il n'y a aucun assistant à retirer", () => {
    const h: CompactMessage[] = [sys(), usr("hi")];
    const snapshot = structuredClone(h);
    expect(dropOldestRound(h)).toBe(false);
    expect(h).toEqual(snapshot);
  });

  it("gère un assistant final sans tool_calls (round d'un seul message)", () => {
    const h: CompactMessage[] = [sys(), usr("go"), asst("first", ["b1"]), toolRes("b1", 10), asst("done")];
    expect(dropOldestRound(h)).toBe(true); // retire assistant b1 + résultat b1
    expect(h).toEqual([sys(), usr("go"), asst("done")]);
    expect(pairingValid(h)).toBe(true);
    expect(dropOldestRound(h)).toBe(true); // retire l'assistant final seul
    expect(h).toEqual([sys(), usr("go")]);
    expect(dropOldestRound(h)).toBe(false); // plus rien à retirer
  });
});

describe("serializeForSummary", () => {
  it("formate les rôles et inclut les tool_calls", () => {
    const out = serializeForSummary([
      usr("do it"),
      asst("reading", ["a1"]),
      toolRes("a1", 5),
    ]);
    expect(out).toContain("USER: do it");
    expect(out).toContain("ASSISTANT: reading");
    expect(out).toContain("→ read_file");
    expect(out).toContain("TOOL RESULT:");
  });
});
