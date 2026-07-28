import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `recordAiUsage` écrit en base (service client) : on le neutralise, mais on garde
// le RESTE du module réel — `parseOpenRouterUsage` participe au chemin testé.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { COMPACT_SUMMARY_PREFIX, SUMMARIZE_INSTRUCTION, estimateTokens } from "./compact";
import { AGENT_COMPACT_ABSOLUTE_MAX_TOKENS } from "@/lib/agent-models";

/**
 * Le CHEMIN COMPLET de la gestion de contexte, exercé pour de vrai (MIN-113).
 *
 * `planCompaction` et `dropOldestRound` ont des tests unitaires depuis toujours,
 * et pourtant la machinerie n'a jamais tourné une seule fois en production : seuil
 * calibré sur la fenêtre du modèle (75 % de 1 M) quand nos plus gros checkpoints
 * pèsent ~140 k tokens. Du code de secours jamais exécuté est du code cassé jusqu'à
 * preuve du contraire — ces tests sont la preuve.
 *
 * On ne moque QUE `fetch` : tout le reste est le vrai chemin (streaming SSE,
 * sous-appel de résumé, reconstruction de l'historique, round suivant qui repart
 * dessus). Ce qu'on vérifie surtout, c'est l'APPARIEMENT `tool_call` ↔ `tool` dans
 * le corps réellement envoyé au provider — c'est lui qui produit un 400 en prod.
 */

// ── Historique synthétique ───────────────────────────────────────────────────
// Le poids est mis sur les messages ASSISTANT (contenu + arguments de tool_calls),
// comme en production : `pruneToolOutputs` n'élague que les sorties de tools, donc
// c'est le côté assistant qui gonfle sans limite sur un run long.

const SYSTEM = "You are numo, a coding agent. " + "Conventions apply. ".repeat(20);
const TASK = "Implement the feature described in MIN-999. " + "Acceptance criteria. ".repeat(20);

function syntheticHistory(rounds: number): AgentChatMessage[] {
  const messages: AgentChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: TASK },
  ];
  for (let i = 0; i < rounds; i++) {
    messages.push({
      role: "assistant",
      content: `Step ${i}: inspecting the module. ` + `reasoning ${i} `.repeat(60),
      tool_calls: [
        {
          id: `call_${i}`,
          type: "function",
          function: { name: "read_file", arguments: JSON.stringify({ path: `src/mod-${i}.ts`, note: "x".repeat(400) }) },
        },
      ],
    });
    messages.push({ role: "tool", tool_call_id: `call_${i}`, content: `contents of mod-${i}: ` + "y".repeat(400) });
  }
  return messages;
}

/** Aucun `tool` orphelin, et chaque assistant porteur de tool_calls suivi de SES
 *  résultats, dans l'ordre — l'invariant qui évite le 400 provider. */
function pairingValid(msgs: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }>): boolean {
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
      return false;
    }
  }
  return true;
}

// ── Faux provider SSE ────────────────────────────────────────────────────────

/** Corps SSE d'une complétion : du texte, puis l'usage, puis [DONE]. */
function sseText(text: string, promptTokens: number): string {
  const chunks = [
    { id: "gen_1", model: "test/model", choices: [{ delta: { content: text } }] },
    {
      id: "gen_1",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: promptTokens, completion_tokens: 10, total_tokens: promptTokens + 10, cost: 0.01 },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** `markSystemPromptCache` transforme certains `content` en tableau de parts. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (p as { text?: string })?.text ?? "").join("");
  return "";
}

interface Sent {
  messages: Array<{ role: string; content?: unknown; tool_calls?: Array<{ id: string }>; tool_call_id?: string }>;
  isSummaryCall: boolean;
}

let sent: Sent[] = [];
let responses: Array<() => Response>;

beforeEach(() => {
  sent = [];
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { messages: Sent["messages"] };
      sent.push({
        messages: body.messages,
        isSummaryCall: textOf(body.messages[0]?.content) === SUMMARIZE_INSTRUCTION,
      });
      const next = responses.shift();
      if (!next) throw new Error("fetch non prévu par le test");
      return next();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseParams = {
  tools: [],
  model: "test/model",
  apiKey: "sk-test",
  baseUrl: "https://example.invalid/v1",
  runId: "run_test",
  softDeadlineMs: 250_000,
  execTool: async () => ({ result: {}, success: true }),
};

describe("chemin complet de compaction", () => {
  it("résume le milieu, reconstruit un historique VALIDE, et le round suivant repart dessus", async () => {
    const messages = syntheticHistory(100); // 202 messages
    const tokensBefore = estimateTokens(messages);
    expect(messages).toHaveLength(202);

    responses = [
      // 1. sous-appel de résumé
      () => new Response(sseText("Task: MIN-999. Done: edited src/mod-0.ts. Next: run tests.", 40_000)),
      // 2. round réel, sans tool-call → fin de tour
      () => new Response(sseText("All done.", 3_000)),
    ];

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      // ×0.75 → seuil ≈ 5 000 tokens : on force la compaction dès le premier round.
      contextWindow: 6_668,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // Le sous-appel de résumé a bien eu lieu, puis le round réel.
    expect(sent).toHaveLength(2);
    expect(sent[0].isSummaryCall).toBe(true);
    expect(sent[1].isSummaryCall).toBe(false);

    // L'event `compacted` est émis, avec un contexte réellement réduit.
    const compacted = events.find((e) => e.type === "status" && e.payload.phase === "compacted");
    expect(compacted).toBeDefined();
    expect(compacted!.payload.tokensAfter as number).toBeLessThan(compacted!.payload.tokensBefore as number);
    expect(compacted!.payload.tokensBefore).toBe(tokensBefore);

    // ── Le corps RÉELLEMENT envoyé au round suivant ──────────────────────────
    const round = sent[1].messages;
    expect(pairingValid(round)).toBe(true); // ← ce qui produit un 400 en prod
    expect(round.filter((m) => m.role === "tool" && !m.tool_call_id)).toHaveLength(0);

    // Préfixe de seed intact, verbatim : critères d'acceptation jamais paraphrasés.
    expect(round[0].role).toBe("system");
    expect(textOf(round[0].content)).toBe(SYSTEM);
    expect(textOf(round[1].content)).toBe(TASK);

    // Le résumé est présent, une seule fois, juste après le seed.
    const summaries = round.filter((m) => textOf(m.content).startsWith(COMPACT_SUMMARY_PREFIX));
    expect(summaries).toHaveLength(1);
    expect(textOf(summaries[0].content)).toContain("Done: edited src/mod-0.ts");
    expect(round.indexOf(summaries[0])).toBe(2);

    // Et le contexte a vraiment fondu.
    expect(round.length).toBeLessThan(messages.length);
    expect(estimateTokens(round as never)).toBeLessThan(tokensBefore);

    // Le tour se termine normalement sur l'historique reconstruit.
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("All done.");
    expect(pairingValid(result.messages)).toBe(true);
  });

  it("le résumé porte sur le MILIEU : la queue récente survit verbatim", async () => {
    const messages = syntheticHistory(100);
    responses = [
      () => new Response(sseText("summary text", 40_000)),
      () => new Response(sseText("ok", 3_000)),
    ];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 6_668,
      emit: async () => {},
    });

    // Le transcript envoyé au résumeur contient les vieux rounds, pas les récents.
    const transcript = textOf(sent[0].messages[1].content);
    expect(transcript).toContain("Step 0:");
    expect(transcript).not.toContain("Step 99:");

    // Et le dernier round d'origine est encore là, mot pour mot.
    const round = sent[1].messages;
    expect(round.some((m) => textOf(m.content).startsWith("Step 99:"))).toBe(true);
  });

  it("une fenêtre de 1 M ne repousse plus le seuil : le plafond absolu prend le relais", async () => {
    // LA régression de MIN-113 : avec `contextWindow * 0.75` seul, le seuil valait
    // 750 000 tokens et cet historique de ~300 k n'aurait jamais rien déclenché.
    // Les bornes sont écrites en DUR : un test qui se compare à la constante qu'il
    // défend ne défend rien.
    const messages = syntheticHistory(700);
    expect(estimateTokens(messages)).toBeGreaterThan(200_000);
    expect(estimateTokens(messages)).toBeLessThan(700_000);
    // La propriété défendue : le plafond mord AVANT les 75 % d'une fenêtre de 1 M.
    expect(AGENT_COMPACT_ABSOLUTE_MAX_TOKENS).toBeLessThan(200_000);

    responses = [
      () => new Response(sseText("summary", 100_000)),
      () => new Response(sseText("done", 20_000)),
    ];
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // Preuve directe que le `Math.min` a mordu : sans lui, le seuil vaudrait
    // 750 000, aucun sous-appel de résumé n'aurait lieu et le premier fetch serait
    // le round réel.
    expect(sent[0].isSummaryCall).toBe(true);
    expect(events.some((e) => e.type === "status" && e.payload.phase === "compacted")).toBe(true);
  });

  it("prévient le modèle AVANT de le couper, une seule fois", async () => {
    // Contexte au-dessus de 70 % du seuil mais sous le seuil : préavis, pas de
    // compaction. Deux rounds pour vérifier que le message n'est pas répété.
    const messages = syntheticHistory(6);
    const tokens = estimateTokens(messages);
    // Seuil placé juste au-dessus du contexte : 70 % franchi, 100 % non.
    const contextWindow = Math.ceil((tokens * 1.2) / 0.75);

    responses = [
      // round 1 : un tool-call, le tour continue
      () =>
        new Response(
          [
            {
              id: "g1",
              model: "test/model",
              choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_file", arguments: "{}" } }] } }],
            },
            { id: "g1", model: "test/model", choices: [{ delta: {} }], usage: { prompt_tokens: tokens, completion_tokens: 5, cost: 0.001 } },
          ]
            .map((c) => `data: ${JSON.stringify(c)}\n\n`)
            .join("") + "data: [DONE]\n\n",
        ),
      // round 2 : fin de tour
      () => new Response(sseText("finished", tokens)),
    ];

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    const warnings = events.filter((e) => e.type === "status" && e.payload.phase === "context_warning");
    expect(warnings).toHaveLength(1);
    expect(events.some((e) => e.type === "status" && e.payload.phase === "compacted")).toBe(false);

    // Le préavis est bien DANS le contexte envoyé au modèle, et une seule fois.
    const injected = result.messages.filter((m) => typeof m.content === "string" && m.content.includes("approaching the context limit"));
    expect(injected).toHaveLength(1);
    expect(injected[0].role).toBe("user");
    expect(pairingValid(result.messages)).toBe(true);
  });
});

describe("élagage de dernier recours (400 « contexte trop long »)", () => {
  it("converge en ≤ 4 essais sans casser l'appariement", async () => {
    const messages = syntheticHistory(20);
    const roundsBefore = messages.filter((m) => m.role === "assistant").length;

    const tooLong = () =>
      new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens." } }), {
        status: 400,
      });
    responses = [tooLong, tooLong, tooLong, () => new Response(sseText("recovered", 4_000))];

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000, // pas de compaction : on isole le dernier recours
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    const trims = events.filter((e) => e.type === "status" && e.payload.phase === "context_trim");
    expect(trims).toHaveLength(3);
    expect(trims.length).toBeLessThanOrEqual(4); // MAX_CONTEXT_TRIMS

    // Le run repart : c'est bien un rattrapage, pas un échec déguisé.
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("recovered");

    // Chaque tentative envoie un historique VALIDE et strictement plus court.
    expect(sent).toHaveLength(4);
    for (const s of sent) {
      expect(pairingValid(s.messages)).toBe(true);
      expect(s.messages[0].role).toBe("system");
      expect(textOf(s.messages[0].content)).toBe(SYSTEM);
      expect(textOf(s.messages[1].content)).toBe(TASK);
    }
    for (let i = 1; i < sent.length; i++) {
      expect(sent[i].messages.length).toBeLessThan(sent[i - 1].messages.length);
    }
    // 3 rounds retirés, seed préservé.
    expect(result.messages.filter((m) => m.role === "assistant").length).toBe(roundsBefore - 3 + 1);
  });

  it("un 400 qui n'est PAS un dépassement de contexte échoue le run sans élaguer", async () => {
    const messages = syntheticHistory(20);
    const before = messages.length;
    responses = [
      () => new Response(JSON.stringify({ error: { message: "invalid tool schema" } }), { status: 400 }),
    ];

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    expect(result.status).toBe("error");
    expect(events.some((e) => e.type === "status" && e.payload.phase === "context_trim")).toBe(false);
    expect(result.messages).toHaveLength(before); // rien n'a été élagué
  });
});
