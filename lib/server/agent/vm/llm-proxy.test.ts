import { connect } from "node:net";

import { describe, expect, it } from "vitest";

import {
  extraHeaders,
  GenerationSniffer,
  patchCompletionBody,
  resolveProxyTarget,
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
    const out = patchCompletionBody(
      { model: "claude-sonnet-5" },
      { ...JOB, provider: "anthropic" },
    );
    expect(out.thinking).toEqual({ type: "adaptive" });
    expect(extraHeaders({ ...JOB, provider: "anthropic" })).toEqual({});
  });

  it("désactive le raisonnement de GPT-5.6 quand opencode envoie des tools", () => {
    const out = patchCompletionBody(
      {
        model: "gpt-5.6-sol",
        tools: [{ type: "function", function: { name: "bash" } }],
      },
      { ...JOB, provider: "openai", reasoningLevel: "high" },
    );
    expect(out.reasoning_effort).toBe("none");
  });

  it("préserve l'usage explicite mais garde le niveau décidé par le run", () => {
    const out = patchCompletionBody(
      { model: "x", usage: { include: false }, reasoning: { effort: "high" } },
      JOB,
    );
    expect(out.usage).toEqual({ include: false });
    expect(out.reasoning).toEqual({ effort: "medium", exclude: false });
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
    expect(out.reasoning).toEqual({ effort: "medium", exclude: false });
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

/**
 * MIN-357 — LA FAILLE MESURÉE, REJOUÉE.
 *
 * L'ancienne garde testait un SUFFIXE sur la request-target brute, que `fetch`
 * normalise ensuite : `'/../v1/keys#/chat/completions'` passait le test et
 * partait sur `/api/v1/keys`, la route de PROVISIONING. Tant que le firewall
 * posait la clé après la sortie de la microVM, ça ne rendait rien ; le jour où
 * le proxy porte la vraie clé (tour local), le modèle s'émet une clé SANS
 * PLAFOND depuis son propre shell.
 */
describe("le proxy ne sert qu'une route", () => {
  const target = (method: string, path: string) =>
    resolveProxyTarget(method, path, "https://openrouter.ai/api/v1");

  it("refuse les trois formes qui menaient ailleurs qu'aux complétions", () => {
    for (const route of ["keys", "credits", "generation"]) {
      const decision = target("POST", `/../v1/${route}#/chat/completions`);
      expect(decision.ok).toBe(false);
      expect(decision.ok === false && decision.status).toBe(400);
      // Ce que l'ancienne forme croyait lire, et ce que `fetch` aurait appelé.
      expect(`/../v1/${route}#/chat/completions`.endsWith("/chat/completions")).toBe(true);
      expect(new URL(`https://openrouter.ai/api/v1/../v1/${route}`).pathname).toBe(`/api/v1/${route}`);
    }
  });

  it("refuse ce qui changerait d'hôte, de forme ou de méthode", () => {
    // `//` : `new URL('https://openrouter.ai/api/v1' + '//evil.test/x')` sort du
    // domaine du fournisseur sans un seul caractère suspect au milieu.
    expect(target("POST", "//evil.test/chat/completions")).toMatchObject({ status: 400 });
    // Une request-target absolue, que le parseur HTTP accepte (forme proxy).
    expect(target("POST", "https://evil.test/chat/completions")).toMatchObject({ status: 400 });
    // Un chemin voisin, sans rien de malformé : ce n'est pas la route servie.
    expect(target("POST", "/keys")).toMatchObject({ status: 404 });
    expect(target("POST", "/chat/completions/x")).toMatchObject({ status: 404 });
    // La route servie, mais en lecture : une sonde, pas un round.
    expect(target("GET", "/chat/completions")).toMatchObject({ status: 405 });
  });

  it("laisse passer la route servie, query comprise", () => {
    expect(target("POST", "/chat/completions")).toEqual({
      ok: true,
      url: "https://openrouter.ai/api/v1/chat/completions",
    });
    expect(target("post", "/chat/completions?beta=1")).toEqual({
      ok: true,
      url: "https://openrouter.ai/api/v1/chat/completions?beta=1",
    });
  });

  /**
   * La même chose sur le VRAI serveur, en écrivant la request-target à la main :
   * `fetch` normaliserait le chemin avant de l'envoyer, donc il ne peut pas
   * prouver ce qui compte ici — c'est un `curl --path-as-is` (ou n'importe quelle
   * socket) que le modèle a sous la main. Et le parseur de node ne rattrape rien :
   * mesuré, `req.url` vaut `/../v1/keys#/chat/completions` À L'IDENTIQUE.
   */
  it("refuse la request-target brute sans jamais appeler le fournisseur", async () => {
    let calls = 0;
    const upstream = (async () => {
      calls++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: upstream,
      apiKey: async () => "sk-or-v1-clef-plafonnee",
    });
    try {
      const answer = await rawRequest(proxy.url, "/../v1/keys#/chat/completions");
      expect(answer.split("\r\n")[0]).toContain("400");
      expect(calls).toBe(0);
    } finally {
      await proxy.close();
    }
  });
});

/** Une requête HTTP écrite à la main — la seule façon de faire arriver une
 *  request-target que `fetch` refuserait de laisser telle quelle. */
function rawRequest(origin: string, requestTarget: string): Promise<string> {
  const { hostname, port } = new URL(origin);
  const body = "{}";
  const head = [
    `POST ${requestTarget} HTTP/1.1`,
    `Host: ${hostname}:${port}`,
    "content-type: application/json",
    `content-length: ${Buffer.byteLength(body)}`,
    "connection: close",
    "",
    body,
  ].join("\r\n");
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) }, () => socket.write(head));
    let out = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (out += chunk));
    socket.on("end", () => resolve(out));
    socket.on("error", reject);
  });
}

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
  it("retente l'autre alias de plafond après son rejet explicite", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { message: "max_tokens is not supported" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(sse([{ id: "gen-retry", model: "m", choices: [] }]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: {
        baseUrl: "https://compatible.example/v1",
        provider: "generic",
        reasoningLevel: "off",
      },
      fetchImpl: upstream,
    });
    try {
      const response = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "m", messages: [], max_completion_tokens: 321 }),
      });
      expect(response.status).toBe(200);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({ max_tokens: 321 });
      expect(bodies[1]).toMatchObject({ max_completion_tokens: 321 });
    } finally {
      await proxy.close();
    }
  });

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

  /**
   * MIN-328 — LE SEUL POINT DE PASSAGE OBLIGÉ ENTRE OPENCODE ET LE MODÈLE.
   *
   * MIN-239 promettait que le modèle ne voit jamais le token de forge : la boucle
   * maison fabriquait chaque message `role:"tool"` et le substituait au passage.
   * Opencode exécute ses tools dans la microVM et construit le corps sans repasser
   * par nous — un `bash("cat .git/config")` remontait donc intact. La substitution
   * revient ici, où tout passe, quelle que soit la sortie de tool.
   */
  it("substitue les secrets du corps sortant, sorties de tools comprises", async () => {
    const TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
    let seenBody = "";
    const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenBody = String(init?.body ?? "");
      return new Response(sse([{ id: "gen-1", model: "m", choices: [{ delta: {} }] }]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: upstream,
      redact: (text) => text.split(TOKEN).join("[redacted]"),
    });
    try {
      await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "m",
          messages: [
            {
              role: "tool",
              content: `url = https://x-access-token:${TOKEN}@github.com/org/repo.git`,
            },
          ],
        }),
      });
      expect(seenBody).not.toContain(TOKEN);
      expect(seenBody).toContain("[redacted]");
      // Le complément du corps est toujours là : substituer ne remplace pas le
      // reste du travail du proxy.
      expect(JSON.parse(seenBody).usage).toEqual({ include: true });
    } finally {
      await proxy.close();
    }
  });

  /**
   * MIN-357 — LE TOUR LOCAL : c'est ce process qui pose la clé, parce qu'il n'y a
   * pas de firewall sur un Mac. Elle ne descend pas plus bas que lui : ni dans le
   * job, ni dans la config d'opencode (que le modèle lit par un `env`).
   */
  it("pose la clé du tour local à la place du placeholder", async () => {
    let seenAuth = "";
    let asked = 0;
    const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenAuth = ((init?.headers ?? {}) as Record<string, string>).authorization ?? "";
      return new Response(sse([{ id: "gen-1", model: "m", choices: [{ delta: {} }] }]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: upstream,
      apiKey: async () => {
        asked++;
        return "sk-or-v1-clef-plafonnee";
      },
    });
    try {
      for (const _ of [1, 2]) {
        await fetch(`${proxy.url}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer placeholder" },
          body: JSON.stringify({ model: "m", messages: [] }),
        });
      }
      expect(seenAuth).toBe("Bearer sk-or-v1-clef-plafonnee");
      // DEMANDÉE UNE FOIS, au démarrage : deux rounds ne font pas deux mints.
      expect(asked).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it("retire le placeholder quand un endpoint local n'a pas de clé", async () => {
    let seenAuth: string | undefined;
    const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenAuth = ((init?.headers ?? {}) as Record<string, string>).authorization;
      return new Response(sse([]), { status: 200 });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: { ...JOB, provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" },
      fetchImpl: upstream,
      apiKey: async () => null,
    });
    try {
      await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer placeholder" },
        body: "{}",
      });
      expect(seenAuth).toBeUndefined();
    } finally {
      await proxy.close();
    }
  });

  it("refuse de démarrer quand le plan de contrôle ne rend pas de clé", async () => {
    // Sans clé plafonnée, un tour local n'a plus AUCUN garde-fou de dépense : le
    // compute de microVM, dernier filet dans le cloud, vaut zéro sur une machine.
    // Mieux vaut un tour qui ne part pas — et qui le dit dans son rapport.
    await expect(startLlmProxy({ job: JOB, apiKey: async () => null })).rejects.toThrow(
      /no capped model key/,
    );
    await expect(
      startLlmProxy({
        job: JOB,
        apiKey: async () => {
          throw new Error("POST /llm-key → 503: minting is not configured");
        },
      }),
    ).rejects.toThrow(/503/);
  });

  it("peut ouvrir le port pendant le mint mais attend la clé avant tout relais", async () => {
    let release!: (key: string) => void;
    const key = new Promise<string>((resolve) => {
      release = resolve;
    });
    let seenAuth = "";
    const upstream = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenAuth = ((init?.headers ?? {}) as Record<string, string>).authorization ?? "";
      return new Response(sse([]), { status: 200 });
    }) as typeof fetch;

    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: upstream,
      apiKey: () => key,
      deferApiKey: true,
    });
    try {
      const relayed = fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        body: "{}",
      });
      await Promise.resolve();
      expect(seenAuth).toBe("");
      release("sk-plafonnee");
      expect((await relayed).status).toBe(200);
      expect(seenAuth).toBe("Bearer sk-plafonnee");
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

  it("dit qu'un endpoint local est indisponible sans proposer de repli cloud", async () => {
    const upstream = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const proxy = await startLlmProxy({
      job: { ...JOB, provider: "local_openai", baseUrl: "http://127.0.0.1:1234/v1" },
      fetchImpl: upstream,
    });
    try {
      const res = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toContain("local model endpoint is unavailable");
      expect(body.error.message).toContain("No cloud provider was used");
    } finally {
      await proxy.close();
    }
  });
});
