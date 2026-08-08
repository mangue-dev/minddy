/**
 * MIN-242 — vérification LIVE du breakpoint glissant, avec le VRAI
 * `markSystemPromptCache` du dépôt (pas une copie du script de mesure).
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_LIVE_CACHE_PROBE=1` n'est pas posé. Elle appelle le fournisseur pour de
 * vrai (quelques dizaines de centimes) et sa réponse dépend du réseau — une
 * suite qui la jouerait à chaque commit serait payante et rouge au hasard.
 *
 *   MDY_LIVE_CACHE_PROBE=1 npx vitest run lib/server/agent/caching-live.probe.test.ts
 *
 * Ce qu'elle exerce, et qu'aucun test unitaire ne peut dire : que le marqueur
 * qu'on pose est réellement HONORÉ par Anthropic à travers OpenRouter, sur les
 * formes exactes de la boucle (assistant porteur de `tool_calls`, résultat en
 * `role:"tool"`), et que la part cachée MONTE avec le run au lieu de décroître.
 */
import { describe, expect, it } from "vitest";
import { markSystemPromptCache } from "./caching";

const LIVE = process.env.MDY_LIVE_CACHE_PROBE === "1";
const MODEL = process.env.MDY_LIVE_CACHE_MODEL ?? "anthropic/claude-sonnet-5";
const ROUNDS = 6;

interface Msg {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

const lorem = (n: number, tag: string) =>
  Array.from(
    { length: n },
    (_, i) => `${tag}-${i} the quick brown fox jumps over the lazy dog while parsing tokens`,
  ).join("\n");

/** Le marquage d'AVANT MIN-242 : système + fin du seed, rien à la fin. */
function markHeadOnly(messages: ReadonlyArray<Msg>): unknown[] {
  let seedEnd = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") break;
    seedEnd = i;
  }
  return messages.map((m, i) => {
    const mark = (i === 0 && m.role === "system") || (i === seedEnd && seedEnd > 0);
    return mark && typeof m.content === "string" && m.content.length > 0
      ? { ...m, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }] }
      : m;
  });
}

async function call(messages: unknown[]) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 32, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    usage?: {
      prompt_tokens?: number;
      cost?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  return {
    prompt: json.usage?.prompt_tokens ?? 0,
    cached: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cost: json.usage?.cost ?? 0,
  };
}

/** Un run synthétique de `ROUNDS` tours. Le nonce empêche les deux bras de se
 *  partager le cache : sans lui, le second lirait ce que le premier a écrit. */
async function run(nonce: string, mark: (m: ReadonlyArray<Msg>) => unknown[]) {
  const messages: Msg[] = [
    { role: "system", content: `SYSTEM ${nonce}\n${lorem(120, `sys${nonce}`)}` },
    { role: "user", content: `CONTEXT ${nonce}\n${lorem(120, `ctx${nonce}`)}` },
  ];
  let prompt = 0;
  let cached = 0;
  let cost = 0;
  const perRound: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const r = await call(mark(messages));
    prompt += r.prompt;
    cached += r.cached;
    cost += r.cost;
    perRound.push(r.cached / Math.max(1, r.prompt));
    const id = `call_${round}`;
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        { id, type: "function", function: { name: "peek", arguments: `{"path":"f${round}.ts"}` } },
      ],
    });
    messages.push({ role: "tool", tool_call_id: id, content: `RESULT ${round}\n${lorem(100, `t${nonce}-${round}`)}` });
  }
  return { hitRate: cached / prompt, cost, perRound };
}

describe.skipIf(!LIVE)("prompt caching, en vrai", () => {
  it(
    "le breakpoint glissant fait monter la part cachée au lieu de la laisser décroître",
    { timeout: 300_000 },
    async () => {
      const nonce = String(Date.now());
      const before = await run(`A${nonce}`, markHeadOnly);
      const after = await run(`B${nonce}`, markSystemPromptCache as (m: ReadonlyArray<Msg>) => unknown[]);

      console.log(
        `tête seule : ${(before.hitRate * 100).toFixed(1)} % cachés, ${before.cost.toFixed(4)} $\n` +
          `glissant   : ${(after.hitRate * 100).toFixed(1)} % cachés, ${after.cost.toFixed(4)} $\n` +
          `par round  : ${after.perRound.map((r) => `${(r * 100).toFixed(0)} %`).join(" → ")}`,
      );

      // Le marqueur est honoré, et il paye.
      expect(after.hitRate).toBeGreaterThan(before.hitRate);
      expect(after.cost).toBeLessThan(before.cost);
      // Le point qui compte : la part cachée MONTE avec le run. Sans le
      // breakpoint glissant elle décroît mécaniquement, la queue n'étant
      // jamais couverte.
      expect(after.perRound.at(-1)!).toBeGreaterThan(after.perRound[1]!);
      expect(before.perRound.at(-1)!).toBeLessThan(before.perRound[1]!);
    },
  );
});
