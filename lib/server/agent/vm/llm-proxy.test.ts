import { describe, expect, it } from "vitest";

import {
  extraHeaders,
  GenerationSniffer,
  patchCompletionBody,
  startLlmProxy,
  takeGeneration,
  type LlmProxyJob,
} from "./llm-proxy";

/**
 * MIN-286 lot 2 — le proxy local, celui qui rend au ledger ce qu'opencode ne dit
 * pas : le `generation_id` et le coût facturé.
 *
 * Le test monte le VRAI serveur (localhost, port libre) et ne moque que le
 * fournisseur. C'est la seule forme qui prouve ce qui compte ici : que le corps
 * relayé est bien celui qu'on a complété, et que le flux ressort intact —
 * un proxy qui avale une frame SSE casse un tour sans rien dire.
 */

const JOB: LlmProxyJob = {
  baseUrl: "https://openrouter.ai/api/v1",
  provider: "openrouter",
  reasoningLevel: "medium",
};

/** Un flux de complétion, tel qu'OpenRouter le rend avec `usage: {include}`. */
function sse(lines: Array<Record<string, unknown>>): string {
  return `${lines.map((l) => `data: ${JSON.stringify(l)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
}

describe("le corps de la requête, complété et pas refait", () => {
  it("ajoute le comptage d'usage d'OpenRouter", () => {
    // C'est LUI qui fait exister le coût facturé dans la réponse ; sans lui, il
    // n'y a rien à opposer au coût qu'opencode calcule.
    const out = patchCompletionBody({ model: "x", messages: [] }, JOB);
    expect(out.usage).toEqual({ include: true });
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("réinjecte le raisonnement que les couches compat perdent", () => {
    // Mesuré au lot 1 : opencode RETIRE `reasoning_effort` à plat du corps. Un
    // BYOK anthropic garderait son round, mais penserait moins — sans un mot.
    const out = patchCompletionBody({ model: "x" }, { ...JOB, provider: "anthropic" });
    expect(out.reasoning_effort).toBe("medium");
    expect(extraHeaders({ ...JOB, provider: "anthropic" })["anthropic-version"]).toBe("2023-06-01");
  });

  it("ne touche à rien de ce qu'opencode a déjà posé", () => {
    const out = patchCompletionBody(
      { model: "x", usage: { include: false }, reasoning: { effort: "high" } },
      JOB,
    );
    expect(out.usage).toEqual({ include: false });
    expect(out.reasoning).toEqual({ effort: "high" });
  });

  it("ne laisse jamais partir les deux formes du raisonnement", () => {
    // Le corps peut porter la forme plate d'opencode ET la nôtre, imbriquée :
    // OpenRouter refuse alors le round en 400 (« "reasoning_effort" and
    // "reasoning.effort" are both provided with conflicting values »), et le tour
    // meurt sans que le niveau demandé y soit pour quoi que ce soit.
    const out = patchCompletionBody(
      { model: "x", reasoning: { effort: "high" }, reasoning_effort: "low" },
      JOB,
    );
    expect(out.reasoning).toEqual({ effort: "high" });
    expect("reasoning_effort" in out).toBe(false);

    // Et dans l'autre sens, sur une couche compat : c'est la forme plate qui reste.
    const compat = patchCompletionBody(
      { model: "x", reasoning: { effort: "high" } },
      { ...JOB, provider: "openai" },
    );
    expect(compat.reasoning_effort).toBe("medium");
    expect("reasoning" in compat).toBe(false);
  });

  it("fait taire le raisonnement quand le run l'a mis à `off`", () => {
    // Même faute, autre bout : un `reasoning_effort` posé par opencode ferait
    // penser — et payer — un run qui avait demandé de ne pas penser.
    const out = patchCompletionBody(
      { model: "x", reasoning_effort: "medium" },
      { ...JOB, reasoningLevel: "off" },
    );
    expect("reasoning_effort" in out).toBe(false);
    expect("reasoning" in out).toBe(false);
  });

  it("n'envoie rien au provider générique, dont on ne sait rien", () => {
    const out = patchCompletionBody({ model: "x" }, { ...JOB, provider: "generic" });
    expect(out).toEqual({ model: "x" });
    expect(extraHeaders({ ...JOB, provider: "generic" })).toEqual({});
  });
});

describe("ce que la réponse laisse voir", () => {
  it("lit l'id et le coût d'une génération streamée", () => {
    const sniffer = new GenerationSniffer();
    sniffer.push(`data: {"id":"gen-1","model":"anthropic/claude-haiku-4.5","choi`);
    // Coupé au milieu d'une frame : c'est le cas normal d'un flux réseau.
    sniffer.push(`ces":[]}\n\ndata: {"id":"gen-1","usage":{"completion_tokens":42,"cost":0.0012}}\n\n`);
    sniffer.end();
    expect(sniffer.captured()).toMatchObject([
      { id: "gen-1", model: "anthropic/claude-haiku-4.5", outputTokens: 42, costUsd: 0.0012 },
    ]);
    // L'usage COMPLET est gardé à côté : c'est lui, et lui seul, qui permet
    // d'écrire la ligne d'un round coupé en vol (MIN-286 lot 3, §2.23).
    expect(sniffer.captured()[0].usage).toMatchObject({
      completionTokens: 42,
      cost: 0.0012,
    });
  });

  it("ne s'étrangle pas sur ce qui n'est pas du JSON", () => {
    const sniffer = new GenerationSniffer();
    sniffer.push(": ping\n\ndata: pas du json\n\nUpstream error\n");
    sniffer.end();
    expect(sniffer.captured()).toEqual([]);
  });

  /**
   * MIN-286 — UNE GÉNÉRATION SANS AUCUNE TRACE N'EN EST PAS UNE.
   *
   * Le lecteur alloue dès la première ligne JSON lisible, sans exiger d'`id` ni
   * d'`usage` : un corps d'erreur du fournisseur (`{"error":{…}}` sur un 429) en
   * fabriquait une, au MODÈLE VIDE — donc appariable à n'importe quel round par
   * `takeGeneration`. Le round repartait sans son coût facturé, et la vraie
   * génération restait en file jusqu'à `recordOrphans`, qui l'écrivait une SECONDE
   * fois : un round facturé deux fois sur une réponse d'erreur.
   */
  it("ne retient RIEN d'un corps d'erreur, qui n'a ni identifiant ni usage", () => {
    const sniffer = new GenerationSniffer();
    sniffer.push(`{"error":{"message":"rate limited","code":429}}`);
    sniffer.end();
    expect(sniffer.captured()).toEqual([]);
  });

  it("garde une génération dès qu'elle a l'un des deux", () => {
    const withId = new GenerationSniffer();
    withId.push(`data: {"id":"gen-1","choices":[]}\n\n`);
    withId.end();
    expect(withId.captured()).toHaveLength(1);

    const withUsage = new GenerationSniffer();
    withUsage.push(`data: {"usage":{"completion_tokens":3,"cost":0.001}}\n\n`);
    withUsage.end();
    expect(withUsage.captured()).toHaveLength(1);
  });
});

describe("l'appariement round → génération", () => {
  it("prend celle qui a le même nombre de tokens de sortie", () => {
    const pool = [
      { id: "gen-a", model: "m", outputTokens: 10, costUsd: 1, usage: null },
      { id: "gen-b", model: "m", outputTokens: 20, costUsd: 2, usage: null },
    ];
    expect(takeGeneration(pool, { model: "m", outputTokens: 20 })?.id).toBe("gen-b");
    // Consommée : le round suivant ne la reprendra pas.
    expect(pool.map((g) => g.id)).toEqual(["gen-a"]);
  });

  it("retombe sur l'ordre d'arrivée quand les tokens ne concordent pas", () => {
    // Les tokens d'opencode et ceux du fournisseur ne se comptent pas forcément
    // pareil ; l'ordre, lui, est toujours vrai en séquentiel.
    const pool = [{ id: "gen-a", model: "m", outputTokens: 7, costUsd: 1, usage: null }];
    expect(takeGeneration(pool, { model: "m", outputTokens: 99 })?.id).toBe("gen-a");
  });

  it("rend `null` plutôt qu'une génération d'un autre modèle", () => {
    const pool = [{ id: "gen-a", model: "autre", outputTokens: 7, costUsd: 1, usage: null }];
    expect(takeGeneration(pool, { model: "m", outputTokens: 7 })).toBeNull();
    expect(pool).toHaveLength(1);
  });
});

describe("le relais, monté pour de vrai", () => {
  it("complète la requête, rend le flux intact, et retient la génération", async () => {
    let seen: { url: string; body: unknown; headers: Record<string, string> } | null = null;
    const upstream = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = {
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      return new Response(
        sse([
          { id: "gen-42", model: "deepseek/deepseek-v4-flash", choices: [{ delta: { content: "ok" } }] },
          { id: "gen-42", usage: { completion_tokens: 5, cost: 0.00031 } },
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const proxy = await startLlmProxy({ job: JOB, fetchImpl: upstream });
    try {
      const res = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer placeholder" },
        body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", messages: [], stream: true }),
      });
      const text = await res.text();

      expect(res.status).toBe(200);
      // Le flux ressort TEL QUEL : opencode le parse derrière, une frame perdue
      // ou réordonnée casserait le round.
      expect(text).toContain('data: {"id":"gen-42"');
      expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);

      expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((seen!.body as Record<string, unknown>).usage).toEqual({ include: true });
      // Le placeholder passe INCHANGÉ : c'est le firewall qui pose la vraie clé
      // à la sortie de la microVM, et le proxy n'en connaît aucune.
      expect(seen!.headers.authorization).toBe("Bearer placeholder");
      expect(seen!.headers["HTTP-Referer"]).toBe("https://minddy.app");

      expect(proxy.take({ model: "deepseek/deepseek-v4-flash", outputTokens: 5 })).toMatchObject({
        id: "gen-42",
        model: "deepseek/deepseek-v4-flash",
        outputTokens: 5,
        costUsd: 0.00031,
      });
    } finally {
      await proxy.close();
    }
  });

  it("rend une erreur JSON quand le fournisseur est injoignable", async () => {
    // Une panne du proxy doit se dire au client (opencode retente), pas faire
    // tomber le process qui tient tout le tour.
    const upstream = (async () => {
      throw new Error("réseau coupé");
    }) as typeof fetch;
    const proxy = await startLlmProxy({ job: JOB, fetchImpl: upstream });
    try {
      const res = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error.message).toContain("réseau coupé");
    } finally {
      await proxy.close();
    }
  });
});
