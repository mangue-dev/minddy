import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  planCompaction,
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
        ...(plan.systemMessage ? [plan.systemMessage] : []),
        { role: "user", content: "summary" },
        ...plan.tail,
      ];
      expect(pairingValid(rebuilt)).toBe(true);
    }
  });

  it("préserve le message système en tête du plan", () => {
    const plan = planCompaction(history(), { keepRecentBytes: 200 });
    expect(plan?.systemMessage?.role).toBe("system");
    // le bloc à résumer ne contient pas le système
    expect(plan?.toSummarize.some((m) => m.role === "system")).toBe(false);
  });

  it("gère un historique sans message système", () => {
    const h = history().slice(1); // retire le système
    const plan = planCompaction(h, { keepRecentBytes: 200 });
    expect(plan?.systemMessage).toBeNull();
    if (plan) expect(pairingValid(plan.tail)).toBe(true);
  });

  it("s'abstient (null) quand il y a trop peu à résumer", () => {
    const plan = planCompaction([sys(), usr("hi"), asst("done")], { keepRecentBytes: 10 });
    expect(plan).toBeNull();
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
