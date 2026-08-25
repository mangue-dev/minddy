import { connect } from "node:net";

import { describe, expect, it } from "vitest";

import {
  extraHeaders,
  GenerationSniffer,
  MAX_LLM_PROXY_BODY_BYTES,
  patchCompletionBody,
  resolveProxyTarget,
  startLlmProxy,
  takeGeneration,
  type LlmProxyJob,
} from "./llm-proxy";

/**
 * MIN-286 batch 2 — the local proxy, the one which returns to the ledger what opencode does not say
 * not: the `generation_id` and the billed cost.
 *
 * The test mounts the REAL server (localhost, free port) and only mocks the
 * provider. This is the only form that proves what matters here: that the relayed body
 * is indeed the one that was completed, and that the flow comes out intact —
 * a proxy that swallows an SSE frame breaks a turn without saying anything.
 */

const JOB: LlmProxyJob = {
  baseUrl: "https://openrouter.ai/api/v1",
  provider: "openrouter",
  reasoningLevel: "medium",
};

/** A completion flow, such as OpenRouter renders with `usage: {include}`. */
function sse(lines: Array<Record<string, unknown>>): string {
  return `${lines.map((l) => `data: ${JSON.stringify(l)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
}

describe("le corps de la requête, complété et pas refait", () => {
  it("ajoute le comptage d'usage d'OpenRouter", () => {
    // It is HE who makes the cost invoiced in the response exist; without him, he
    // there is nothing to oppose to the cost that opencode calculates.
    const out = patchCompletionBody({ model: "x", messages: [] }, JOB);
    expect(out.usage).toEqual({ include: true });
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("réinjecte le raisonnement que les couches compat perdent", () => {
    // Measured at batch 1: opencode REMOVES `reasoning_effort` flat from the body. A
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
    // The body can carry opencode's flat form AND ours, nested:
    // OpenRouter then refuses the round in 400 ("reasoning_effort" and
    // "reasoning.effort" are both provided with conflicting values"), and the trick
    // dies without the requested level having anything to do with it.
    const out = patchCompletionBody(
      { model: "x", reasoning: { effort: "high" }, reasoning_effort: "low" },
      JOB,
    );
    expect(out.reasoning).toEqual({ effort: "medium", exclude: false });
    expect("reasoning_effort" in out).toBe(false);

    // And in the other direction, on a flat layer: it is the flat shape that remains.
    const compat = patchCompletionBody(
      { model: "x", reasoning: { effort: "high" } },
      { ...JOB, provider: "openai" },
    );
    expect(compat.reasoning_effort).toBe("medium");
    expect("reasoning" in compat).toBe(false);
  });

  it("fait taire le raisonnement quand le run l'a mis à `off`", () => {
    // Same fault, other end: a `reasoning_effort` set by opencode would
    // think — and pay — for a run that required not thinking.
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
 * MIN-357 — THE FAULT MEASURED, REPLAYED.
 *
 * The old guard tested a SUFFIX on the raw request-target, which `fetch`
 * then normalized: `'/../v1/keys#/chat/completions'` passed the test and
 * was leaving on `/api/v1/keys`, the PROVISIONING route. As long as the firewall
 * installed the key after exiting the microVM, it did nothing; the day when
 * the proxy carries the real key (local turn), the model issues a key WITHOUT
 * CEILING from its own shell.
 */
describe("le proxy ne sert qu'une route", () => {
  const target = (method: string, path: string) =>
    resolveProxyTarget(method, path, "https://openrouter.ai/api/v1");

  it("refuse les trois formes qui menaient ailleurs qu'aux complétions", () => {
    for (const route of ["keys", "credits", "generation"]) {
      const decision = target("POST", `/../v1/${route}#/chat/completions`);
      expect(decision.ok).toBe(false);
      expect(decision.ok === false && decision.status).toBe(400);
      // What the old form thought it read, and what `fetch` would have called.
      expect(`/../v1/${route}#/chat/completions`.endsWith("/chat/completions")).toBe(true);
      expect(new URL(`https://openrouter.ai/api/v1/../v1/${route}`).pathname).toBe(`/api/v1/${route}`);
    }
  });

  it("refuse ce qui changerait d'hôte, de forme ou de méthode", () => {
    // `//` : `new URL('https://openrouter.ai/api/v1' + '//evil.test/x')` sort du
    // provider domain without a single suspicious character in the middle.
    expect(target("POST", "//evil.test/chat/completions")).toMatchObject({ status: 400 });
    // An absolute request-target, which the HTTP parser accepts (proxy form).
    expect(target("POST", "https://evil.test/chat/completions")).toMatchObject({ status: 400 });
    // A nearby path, without anything malformed: it is not the route served.
    expect(target("POST", "/keys")).toMatchObject({ status: 404 });
    expect(target("POST", "/chat/completions/x")).toMatchObject({ status: 404 });
    // The route served, but in reading: a probe, not a round.
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
 * The same thing on the REAL server, writing the request-target by hand:
 * `fetch` would normalize the path before sending it, so it can't prove what matters here — it's a `curl --path-as-is` (or whatever which
 * socket) that the model has on hand. And the node parser doesn't catch anything:
 * measured, `req.url` is worth `/../v1/keys#/chat/completions` EQUALLY.
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

describe("the self-hosted relay", () => {
  it("forwards completions to the runner with the control token, never a provider key", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const upstream = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: upstream,
      relay: {
        baseUrl: "http://agent-runner:6464/v1/sandboxes/agent-1/llm",
        token: () => "server-control-token",
      },
    });

    try {
      await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer placeholder", "content-type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-5", messages: [] }),
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(
        "http://agent-runner:6464/v1/sandboxes/agent-1/llm/chat/completions",
      );
      expect(requests[0].init.headers).toMatchObject({
        authorization: "Bearer server-control-token",
      });
    } finally {
      await proxy.close();
    }
  });
});

describe("request body bounds", () => {
  it("rejects an oversized Content-Length before calling or buffering upstream", async () => {
    let calls = 0;
    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: (async () => {
        calls++;
        return new Response("{}");
      }) as typeof fetch,
    });
    try {
      const response = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        body: Buffer.alloc(MAX_LLM_PROXY_BODY_BYTES + 1),
      });
      expect(response.status).toBe(413);
      expect(calls).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it("stops buffering a chunked body as soon as its streamed bytes cross the limit", async () => {
    let calls = 0;
    const proxy = await startLlmProxy({
      job: JOB,
      fetchImpl: (async () => {
        calls++;
        return new Response("{}");
      }) as typeof fetch,
    });
    const half = Math.floor(MAX_LLM_PROXY_BODY_BYTES / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(half));
        controller.enqueue(new Uint8Array(MAX_LLM_PROXY_BODY_BYTES - half + 1));
        controller.close();
      },
    });
    try {
      const response = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      expect(response.status).toBe(413);
      expect(calls).toBe(0);
    } finally {
      await proxy.close();
    }
  });
});

/** A hand-written HTTP request — the only way to get a
 * request-target that `fetch` would refuse to leave as is. */
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
    // Cut in the middle of a frame: this is the normal case for a network stream.
    sniffer.push(`ces":[]}\n\ndata: {"id":"gen-1","usage":{"completion_tokens":42,"cost":0.0012}}\n\n`);
    sniffer.end();
    expect(sniffer.captured()).toMatchObject([
      { id: "gen-1", model: "anthropic/claude-haiku-4.5", outputTokens: 42, costUsd: 0.0012 },
    ]);
    // COMPLETE usage is kept aside: it is he, and he alone, who allows
    // to write the line of a round cut in flight (MIN-286 lot 3, §2.23).
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
 * MIN-286 — A GENERATION WITHOUT ANY TRACE IS NOT ONE.
 *
 * The reader allocates readable JSON on the first line, without requiring `id` nor
 * `usage`: a body provider error (`{"error":{…}}` on a 429) en
 * manufactured one, with EMPTY MODEL — therefore matchable to any round by
 * `takeGeneration`. The round restarted without its billed cost, and the real
 * generation remained in line until `recordOrphans`, which wrote it a SECOND
 * time: a round billed twice on an error response.
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
    // Consumed: the next round will not take it back.
    expect(pool.map((g) => g.id)).toEqual(["gen-a"]);
  });

  it("retombe sur l'ordre d'arrivée quand les tokens ne concordent pas", () => {
    // Opencode tokens and those of the supplier are not necessarily counted
    // The same ; the order is always true sequentially.
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
      // The flow comes out AS IS: opencode parses it behind, one frame lost
      // or reordered would break the round.
      expect(text).toContain('data: {"id":"gen-42"');
      expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);

      expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((seen!.body as Record<string, unknown>).usage).toEqual({ include: true });
      // The placeholder goes UNCHANGED: it is the firewall which sets the real key
      // at the exit of the microVM, and the proxy does not know any.
      expect(seen!.headers.authorization).toBe("Bearer placeholder");
      expect(seen!.headers["HTTP-Referer"]).toBe("http://localhost:3000");

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
 * MIN-328 — THE ONLY COMPULSORY PASSING POINT BETWEEN OPENCODE AND THE MODEL.
 *
 * MIN-239 promised that the model never sees the forge token: the loop
 * made each message `role:"tool"` and substituted it in passing.
 * Opencode executes its tools in the microVM and builds the body without passing
 * through us — a `bash("cat .git/config")` therefore came back intact. The substitution
 * returns here, where everything passes, regardless of the output of tool.
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
      // The complement of the body is still there: substituting does not replace the
      // reste du travail du proxy.
      expect(JSON.parse(seenBody).usage).toEqual({ include: true });
    } finally {
      await proxy.close();
    }
  });

  /**
 * MIN-357 — THE LOCAL TURN: it is this process which sets the key, because there is
 * no firewall on a Mac. It does not go lower than it: neither in the
 * job, nor in the opencode config (which the model reads with a `env`).
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
      // REQUESTED ONCE, at startup: two rounds do not make two mints.
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
    // Without a capped key, a local tour no longer has ANY spending safeguards: the
    // microVM compute, last net in the cloud, is zero on a machine.
    // Better a tour that doesn't leave — and that says so in its report.
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
    // A proxy failure must be reported to the client (opencode retry), not done
    // drop the process that holds everything together.
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
