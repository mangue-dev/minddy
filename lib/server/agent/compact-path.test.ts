import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 ; ce mock ne garde plus
// que le reste du graphe. On neutralise l'écriture, mais on garde
// le RESTE du module réel — `parseOpenRouterUsage` participe au chemin testé.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

// Espion SUR le vrai élagage (MIN-248) : ce qu'on veut voir, c'est qu'il ne soit
// PAS appelé sous le seuil de pression — un no-op interne ne se distingue pas d'un
// appel évité par l'extérieur, et c'est pourtant tout le sujet du ticket.
vi.mock("./prune", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./prune")>();
  return { ...actual, pruneToolOutputs: vi.fn(actual.pruneToolOutputs) };
});

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { pruneToolOutputs, PRUNE_STUB } from "./prune";
import { COMPACT_SUMMARY_PREFIX, SUMMARIZE_INSTRUCTION, estimateTokens } from "./compact";
import { AGENT_COMPACT_BASELINE_TOKENS } from "@/lib/agent-models";

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
  vi.mocked(pruneToolOutputs).mockClear();
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
  billTo: { userId: "user_test" } as const,
  // Le ledger est INJECTÉ depuis MIN-224 : la boucle ne connaît plus le chemin de
  // la base. Ici, un puits — ce test ne mesure pas la dépense.
  recordUsage: async () => {},
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
    expect(AGENT_COMPACT_BASELINE_TOKENS).toBeLessThan(200_000);

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

  it("ne le répète pas au chunk suivant, sur le checkpoint repris", async () => {
    // MIN-218 — le test ci-dessus ne couvrait qu'UN chunk. `runAgentLoop` tourne
    // une fois PAR chunk : tout ce qui vit dans son corps repart à zéro à chaque
    // reprise, alors que `messages` (le checkpoint) traverse. Un drapeau local
    // disait donc « jamais prévenu » sur un historique qui portait déjà le préavis,
    // et en poussait un deuxième — sur un message qui dit « finis ton étape et
    // réponds ». Un tour lourd tient sur plusieurs chunks : le tour se faisait
    // pousser vers la sortie une fois de plus à chaque reprise.
    //
    // On rejoue donc les DEUX chunks, comme l'exécuteur : deuxième appel sur les
    // messages rendus par le premier.
    const messages = syntheticHistory(6);
    // Seuil au-dessus du contexte des deux chunks (il ne fait que croître) : 70 %
    // franchi tout du long, 100 % jamais — la bande où le préavis se répétait.
    const contextWindow = Math.ceil((estimateTokens(messages) * 1.2) / 0.75);

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const emit = async (type: string, payload: Record<string, unknown>) => {
      events.push({ type, payload });
    };

    responses = [() => new Response(sseText("chunk 1", estimateTokens(messages)))];
    const first = await runAgentLoop({ ...baseParams, messages, contextWindow, emit });

    responses = [() => new Response(sseText("chunk 2", estimateTokens(first.messages)))];
    const second = await runAgentLoop({
      ...baseParams,
      messages: first.messages,
      contextWindow,
      emit,
    });

    // Le seuil est bien resté dans la bande visée sur les deux chunks : sans ça le
    // test passerait pour la mauvaise raison (préavis jamais franchi, ou compacté).
    const threshold = contextWindow * 0.75;
    expect(estimateTokens(second.messages)).toBeGreaterThan(threshold * 0.7);
    expect(estimateTokens(second.messages)).toBeLessThan(threshold);
    expect(events.some((e) => e.type === "status" && e.payload.phase === "compacted")).toBe(false);

    // UN préavis pour les deux chunks — l'event comme la copie dans l'historique.
    const warnings = events.filter((e) => e.type === "status" && e.payload.phase === "context_warning");
    expect(warnings).toHaveLength(1);
    const injected = second.messages.filter((m) => textOf(m.content).includes("approaching the context limit"));
    expect(injected).toHaveLength(1);

    // Et ce que le modèle a VRAIMENT reçu au deuxième chunk : une seule copie.
    const resumed = sent[1].messages.filter((m) => textOf(m.content).includes("approaching the context limit"));
    expect(resumed).toHaveLength(1);
    expect(pairingValid(second.messages)).toBe(true);
  });
});

/**
 * Le QUOTA de compaction (MIN-259) : il se comptait par appel de `runAgentLoop`,
 * sous un nom qui disait « par chunk ». Vrai tant qu'un appel valait douze
 * minutes ; faux depuis le moteur microVM, qui appelle la boucle une seule fois
 * pour un tour de 12 h et 2 000 rounds — trois compactions pour tout le tour, puis
 * le bloc sauté en silence jusqu'au bout.
 *
 * Ces tests exercent la boucle sur PLUS d'une fenêtre, ce qu'aucun test ne faisait :
 * la panne n'était visible que là.
 */
describe("quota de compaction : par fenêtre de rounds, et il le dit", () => {
  /** Un tool-call (le tour continue), avec les `prompt_tokens` qu'on veut. */
  function sseToolCall(id: string, promptTokens: number): Response {
    return new Response(
      [
        {
          id: "g",
          model: "test/model",
          // Un chemin DIFFÉRENT à chaque round : sinon c'est le détecteur de boucle
          // (MIN-243) qui coupe le tour, et le quota ne serait jamais atteint.
          choices: [
            { delta: { tool_calls: [{ index: 0, id, function: { name: "read_file", arguments: JSON.stringify({ path: `src/${id}.ts` }) } }] } },
          ],
        },
        {
          id: "g",
          model: "test/model",
          choices: [{ delta: {} }],
          usage: { prompt_tokens: promptTokens, completion_tokens: 5, cost: 0.001 },
        },
      ]
        .map((c) => `data: ${JSON.stringify(c)}\n\n`)
        .join("") + "data: [DONE]\n\n",
    );
  }

  /**
   * Contexte TOUJOURS au-dessus du seuil : chaque round veut compacter. Le fournisseur
   * répond un tool-call à chaque round réel et un résumé (vide, pour ne rien changer
   * à l'historique) à chaque sous-appel — seul le QUOTA décide alors du nombre de
   * sous-appels, et c'est exactement ce qu'on mesure.
   */
  function alwaysOverThreshold(rounds: number) {
    let served = 0;
    responses = Array.from({ length: rounds * 2 }, () => () => {
      // Le résumé se reconnaît au prompt système du sous-appel, déjà poussé dans `sent`.
      const last = sent[sent.length - 1];
      served++;
      return last?.isSummaryCall ? new Response(sseText("", 200_000)) : sseToolCall(`c${served}`, 200_000);
    });
  }

  it("le quota se RECHARGE à la fenêtre suivante", async () => {
    // 151 rounds : une fenêtre pleine (150) plus un round. Sans recharge, le tour
    // entier n'a droit qu'à 3 compactions — c'est la panne.
    const messages = syntheticHistory(100);
    alwaysOverThreshold(200);

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000, // seuil absolu 120 k, contexte rapporté 200 k
      maxRounds: 151,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // 3 sous-appels dans la première fenêtre, 1 dans la seconde (round 151).
    const summaryCalls = sent.filter((s) => s.isSummaryCall);
    expect(summaryCalls).toHaveLength(4);

    // Et le franchissement est dit UNE fois par fenêtre, pas à chaque round.
    const exhausted = events.filter((e) => e.type === "status" && e.payload.phase === "compact_quota_exhausted");
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0].payload.window).toBe(0);
    expect(exhausted[0].payload.max).toBe(3);
    // Le round 1 juge sur l'ESTIMATION (aucun `prompt_tokens` rapporté encore) et
    // passe sous le seuil : les compactions tombent aux rounds 2, 3 et 4.
    expect(exhausted[0].payload.round).toBe(5); // le premier round sauté
  });

  it("un quota épuisé ne parle qu'une fois, et ne parle pas du tout s'il n'est pas atteint", async () => {
    const messages = syntheticHistory(100);
    alwaysOverThreshold(20);

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000,
      maxRounds: 20,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // 17 rounds sautés après les 3 compactions, un seul event.
    expect(sent.filter((s) => s.isSummaryCall)).toHaveLength(3);
    expect(events.filter((e) => e.type === "status" && e.payload.phase === "compact_quota_exhausted")).toHaveLength(1);
  });

  it("ancienne forme (un chunk = une fenêtre) : comportement inchangé", async () => {
    // Le chunk s'arrête à `MAX_ROUNDS_PER_CHUNK` (150) : il tient dans la fenêtre 0,
    // donc le quota ne se recharge jamais et rien ne bouge par rapport à avant.
    const messages = syntheticHistory(100);
    alwaysOverThreshold(200);

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    expect(result.status).toBe("suspended"); // plafond de rounds du chunk
    expect(result.rounds).toBe(150);
    expect(sent.filter((s) => s.isSummaryCall)).toHaveLength(3);
    expect(
      events.filter((e) => e.type === "status" && e.payload.phase === "compact_quota_exhausted").map((e) => e.payload.window),
    ).toEqual([0]);
  });

  it("sous le seuil, aucun quota consommé et aucun event", async () => {
    const messages = syntheticHistory(6);
    responses = [() => new Response(sseText("done", 500))];
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });
    expect(events.some((e) => e.type === "status" && e.payload.phase === "compact_quota_exhausted")).toBe(false);
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

/**
 * L'élagage sous PRESSION seulement, et jamais la dernière lecture d'un chemin
 * (MIN-248). Ces deux propriétés se vérifient au niveau de la BOUCLE : l'unité
 * `pruneToolOutputs` était déjà juste prise seule — la panne était dans la
 * cadence de son appel et dans ce qu'on lui laissait ignorer.
 */
describe("élagage : soupape de pression, pas rituel de round", () => {
  /** Un historique LOURD : les sorties de tools y pèsent, comme en production. */
  function heavyHistory(rounds: number, bytes: number): AgentChatMessage[] {
    const messages: AgentChatMessage[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: TASK },
    ];
    for (let i = 0; i < rounds; i++) {
      // Le round 0 lit un fichier que PLUS AUCUN round ne relira : sa lecture sort
      // de la fenêtre protégée dès le premier élagage. C'est exactement celle que
      // le modèle rachetait, et exactement celle que `keepLastPerKey` garde.
      const path = i === 0 ? "src/rare.ts" : `src/mod-${i % 2}.ts`;
      messages.push({
        role: "assistant",
        content: `Step ${i}.`,
        tool_calls: [
          {
            id: `call_${i}`,
            type: "function",
            function: { name: "read_file", arguments: JSON.stringify({ path, offset: i }) },
          },
        ],
      });
      messages.push({ role: "tool", tool_call_id: `call_${i}`, content: "y".repeat(bytes) });
    }
    return messages;
  }

  const resultOf = (msgs: AgentChatMessage[], id: string) =>
    msgs.find((m) => m.role === "tool" && m.tool_call_id === id);

  it("ne tourne PAS du tout sous le seuil de pression", async () => {
    // LA régression : `pruneToolOutputs(messages)` était appelé à chaque round,
    // inconditionnellement, sur des runs qui ne montaient jamais.
    const messages = syntheticHistory(6);
    responses = [() => new Response(sseText("done", 500))];
    await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000, // seuil à 120 k, contexte à ~2 k
      emit: async () => {},
    });
    expect(pruneToolOutputs).not.toHaveBeenCalled();
  });

  it("tourne sous pression et garde la dernière lecture de CHAQUE chemin", async () => {
    const messages = heavyHistory(120, 6_000); // ~720 Ko de sorties de tools
    responses = [() => new Response(sseText("done", 100_000))];
    const result = await runAgentLoop({
      ...baseParams,
      messages,
      contextWindow: 1_000_000, // seuil absolu de 120 k → élagage dès 84 k
      emit: async () => {},
    });

    expect(pruneToolOutputs).toHaveBeenCalled();
    // Il a bien élagué : sinon le test passerait pour la mauvaise raison.
    const stubs = result.messages.filter((m) => m.content === PRUNE_STUB);
    expect(stubs.length).toBeGreaterThan(20);

    // La lecture solitaire du round 0 survit, malgré 119 rounds d'écart.
    expect(resultOf(result.messages, "call_0")?.content).not.toBe(PRUNE_STUB);
    // Et une lecture d'un chemin relu plus tard, elle, part.
    expect(resultOf(result.messages, "call_1")?.content).toBe(PRUNE_STUB);
    expect(pairingValid(result.messages)).toBe(true);
  });
});
