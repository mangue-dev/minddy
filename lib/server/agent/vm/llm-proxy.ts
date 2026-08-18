import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  chatCompletionsUrl,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import {
  aiChatProviderHeaders,
  repairRejectedAiChatBody,
  translateLegacyAiChatBody,
} from "@/lib/ai-chat";
import {
  parseOpenRouterUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage-shape";
import type { NormalizedUsage } from "@/lib/server/ai-usage";
import type { RedactText } from "../redact";

/**
 * THE SUPERVISOR'S LOCAL PROXY (MIN-286, lot 2) — the forty lines that
 * rendent au ledger ce qu'opencode ne dit pas.
 *
 * Opencode speaks to the provider with a `baseURL`; we make it point to
 * `127.0.0.1` **in the microVM**, and this server relays to the real one. THE
 * traffic therefore always leaves the VM with the PLACEHOLDER, the firewall places the
 * key after exit like today, `network-policy.ts` does not change one
 * line and no secrets enter the process where the model executes from the shell.
 *
 * AND ON THE USER'S MACHINE, IT IS THIS PROCESS WHICH SET THE KEY (MIN-357).
 * There is no firewall on a Mac: the key goes down here — and no more
 * low — requested from the control plane at the start of the tour, kept in memory, and
 * placed on the only route served (see `LlmProxyOptions.apiKey` and
 * `resolveProxyTarget`). This is what makes the path guard, below, a
 * safety piece and more a convenience.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE THINGS THAT ARE ONLY DONE THERE, and it is for them that it exists
 *
 * 1. **The `generation_id`.** An opencode wizard message carries
 *    `id, sessionID, role, time, parentID, modelID, providerID, mode, agent,
 * path, cost, tokens, finish` — and that's it (file §2.6). The identifier of
 * generation of the supplier, the one by which an invoice is reconciled and by
 * which customer support escalates a call, does not exist anywhere. He is in
 * the RESPONSE, which this proxy sees.
 * 2. **The cost ACTUALLY charged.** `usage: {include: true}` asks OpenRouter
 * the cost of generation in the last frame of the flow. Opencode, he
 * CALCULATE yours (our prices × tokens from batch 1). The batch 0 probe has
 * measured a zero gap over five generations — but the zero gap of one day is not
 * not a guarantee, and it is the supplier's figure which is authentic on the day
 * they diverge. This is also what makes the ledger IDENTICAL between the two
 * engines, which is the changeover criterion for lot 3.
 * 3. **The level of reasoning of the compat. layers** Measured in batch 1:
 * `reasoning_effort` flat is REMOVED from body by opencode; only the form
 * nested (OpenRouter) survives. An openai/google BYOK would lose
 * so his reasoning in silence - the round leaves, it costs, it thinks less.
 * Anthropic has the same problem with its `thinking` form. The field is
 * reinjected here, in the model-aware form that the registry declares
 * ([agent-providers.ts](../../../agent-providers.ts), `reasoningField`) — and
 * in THIS ONE ONLY: a body which bears both forms at the same time leaves
 *    en 400 chez OpenRouter (« both provided with conflicting values »), donc
 * the other is removed from the body before the relay.
 *
 * WHAT IT DOES NOT DO: decide. He observes and completes the body; the ledger,
 * caps and matching remain with the supervisor.
 */

/** What a generation has let us see in passing. */
export interface CapturedGeneration {
  /** L'`id` du fournisseur — `gen-…` chez OpenRouter. */
  id: string | null;
  /** The model as the supplier returns it (he can specify a variant). */
  model: string;
  /** Output tokens, when the provider counts them. */
  outputTokens: number | null;
  /** The cost CHARGED, when the supplier renders it (`usage: {include: true}`). */
  costUsd: number | null;
  /**
   * FULL usage of the provider, kept for the rounds which opencode will not say
   * never anything (`drain`). On an ordinary round it is not useful: tokens
   * come from the message assistant, which already holds them.
   */
  usage: NormalizedUsage | null;
}

/** What the supervisor gets from the proxy. */
export interface LlmProxy {
  /** `http://127.0.0.1:<port>` — the `baseURL` to give to opencode. */
  readonly url: string;
  /**
   * The generation of THIS round, removed from the queue.
   *
   * Matching is done by model, then by output tokens when they
   * agree, otherwise in the order of arrival. It is therefore EXACT sequentially, and
   * only likely when two girls are running in parallel ON THE SAME
   * MODEL — in which case two `generation_id` of the same run and the same model
   * can be exchanged. What is at stake here is a reference of reconciliation, not
   * an expense: the tokens and cost come from the round, not from the pairing.
   */
  take(round: { model: string; outputTokens: number }): CapturedGeneration | null;
  /**
   * THE GENERATIONS THAT NO MORE ROUND WILL COME TO TAKE, removed from the queue.
   *
   * This is what a CUT IN FLIGHT round leaves behind, and it's the only
   * place of the harness where its expenditure still exists. Measured on 2026-08-12
   * (file §2.23): opencode charges NOTHING for an aborted round — `finish: null`,
   * `cost: 0`, `tokens: 0`, `error: MessageAbortedError` — while 179 characters
   * were already written and the supplier actually invoiced
   * $0.002827. Without this drain, a “Stop”, a ceiling or a deadline would emerge
   * the expenditure of the ledger, the quota and the invoice, on a triggerable gesture
   * will — the exact fault that MIN-216 had closed on the home loop side.
   *
   * What this proxy has more than everything else: **it does not cut upstream when
   * the customer leaves**. The `fetch` to the supplier has no signal, the
   * continuous playback loop until the end of the stream (measured: 1221 ms after the
   * leaving the client, without a socket error), and the last frame — the one that
   * carries `usage` and its cost — therefore arrives anyway. The written line is not
   * an estimate: this is the supplier's figure.
   */
  drain(): CapturedGeneration[];
  /**
   * Waits for STILL IN FLIGHT relays to complete, at most `timeoutMs`.
   *
   * To call before `drain`, and it's a matter of racing, not caution:
   * when the client cuts off, the upstream continues — measured at **1221 ms** longer
   * until its last frame. Drain immediately after a `abort` does not
   * would therefore find nothing, and the expense would go back through the hole that we have just
   * butcher. The ceiling exists for the opposite case: a supplier who does not
   * would never close its flow must not hold the end of the round.
   */
  settle(timeoutMs: number): Promise<void>;
  close(): Promise<void>;
}

export interface LlmProxyJob {
  /** The real base URL of the provider (without `/chat/completions`). */
  baseUrl: string;
  provider: AgentProviderId;
  reasoningLevel: ReasoningLevel;
}

export interface LlmProxyOptions {
  job: LlmProxyJob;
  /** 0 = a free port chosen by the OS (the default, and what the tests do). */
  port?: number;
  /** Injected for testing: the provider, without network. */
  fetchImpl?: typeof fetch;
  /**
   * THE KEY TO THE MODEL, WHEN IT IS UP TO US TO ASK IT (MIN-357) — presents
   * ONLY when the trick plays on the user's machine.
   *
   * In microVM, this field is absent and nothing changes: the loop sends the
   * placeholder, the firewall places the real key after exiting the VM, and this
   * process holds nothing. On a Mac there is no firewall, so the key
   * must exist somewhere — and “somewhere” is HERE, in the
   * proxy memory, not in `job.json` nor in `OPENCODE_CONFIG_CONTENT`
   * (which enters the opencode server environment, therefore readable by a
   * simple `env` of the model shell).
   *
   * REQUESTED ONCE, AT STARTUP, and kept closed. The control plan
   * only returns a HARD CEILING MINTED key (`/llm-key`, control-plane.ts): this
   * which limits the damage is not the hiding place — the model can call this proxy
   * from its own shell, it listens on `127.0.0.1` — this is the ceiling that
   * the supplier holds. Hence the refusal to start without a key, lower: one turn
   * premises without a ceiling is not a degraded turn, it is a turn which should not
   * avoir lieu.
   */
  apiKey?: () => Promise<string | null>;
  /** Opens port during mint; each relay still waits for the key. */
  deferApiKey?: boolean;
  /** Jalons locaux de diagnostic, sans corps, URL ni secret. */
  onTiming?: (stage: string) => void;
  /**
   * THE SUBSTITUTION OF SECRETS, BEFORE THE MODEL (MIN-328) — and it is HERE that it
   * doit vivre sous ce moteur.
   *
   * The invariant of MIN-239 (“the model no longer sees the token at all”) held
   * because the home loop produced each `role:"tool"` message itself
   * and substituted it in passing. Opencode executes its tools IN the
   * microVM and constructs the body of the request without going through us again: a
   * `bash("cat .git/config")` therefore went back to the intact model, which could
   * then copy it into a file, a commit or its response.
   *
   * This proxy is the ONLY mandatory crossing point between opencode and the
   * supplier: the substitution placed on the outgoing body applies to all
   * tool releases, present and future, without knowing anything about them. She wears
   * on serialized JSON — a forge token is alphanumeric, it does not undergo
   * no JSON escape and is found as is in the string.
   */
  redact?: RedactText;
}

/**
 * THE BODY OF A REQUEST, COMPLETED — pure, therefore testable without a server.
 *
 * On AJOUTE, on ne remplace pas : opencode a construit ce corps (messages, tools,
 * `stream`, and the nested form of the reasoning when it passes), and this is not
 * not our job to do it again. A field already present remains as it is — this is what
 * which causes a future version of opencode to start sending `usage`
 * she herself does not end up with two truths.
 */
export function patchCompletionBody(
  body: Record<string, unknown>,
  job: LlmProxyJob,
): Record<string, unknown> {
  return translateLegacyAiChatBody(body, job.provider, job.reasoningLevel);
}

/** Headers that the registry adds, and that opencode does not know about. */
export function extraHeaders(job: LlmProxyJob): Record<string, string> {
  return aiChatProviderHeaders(job.provider, "Numo agent (minddy)");
}

/** What an incoming request has the right to become: a URL, or a refusal. */
export type ProxyRoute =
  | { ok: true; url: string }
  | { ok: false; status: 400 | 404 | 405; message: string };

/**
 * THE PROXY SERVES A ROUTE, IT IS NOT A GENERIC RELAY (MIN-357) — and
 * this is the line that decides whether the key lock holds or falls entirely.
 *
 * THE OLD FORM WAS A SUFFIX TEST ON A RAW REQUEST-TARGET
 * (`path.split("?")[0].endsWith("/chat/completions")`). Measure :
 *
 * ```
 * '/../v1/keys#/chat/completions'.endsWith('/chat/completions')  → true
 * new URL('https://openrouter.ai/api/v1' + ce_chemin).pathname   → /api/v1/keys
 * ```
 *
 * `fetch` normalizes the `..` and throws away the fragment: what the test looks at and what
 * that the relay is calling are NOT the same path. As long as the key was placed
 * by the firewall after exiting the VM, it did not return anything (the placeholder
 * left again in 401); the day this proxy carries the real key, **the model
 * issues a key without cap from its own shell** and lock 2 falls
 * entirely. Same flaw on `/api/v1/credits` and `/api/v1/generation`.
 *
 * Hence the four guards, in this order, and none are decorative:
 *
 * 1. **400 on `#`, `..`, `//` and on any path not starting with `/`.**
 * It's the denial of everything that makes a channel and its URL different —
 * discarded fragment, normalized segments, and the `//` which completely changes
 * (`new URL('https://a/api' + '//evil.com/x')`). We refuse FORM
 * rather than trying to guess what it will become.
 * 2. **Strict equality on `url.pathname`**, never a suffix or a prefix:
 * it's the same word that puts `/api/v1/keys` out of reach in politics
 * network (`path: { exact }`, network-policy.ts), and for the same reason.
 * 3. **The origin, also compared.** Redundant with guard 1 today;
 * free, and it is this which holds if someone softens the other.
 * 4. **`POST` required.** The completion route is a POST; a GET on it is
 * a probe, not a round.
 *
 * WHAT IT REFUSES AND WHICH CAME BEFORE: everything else from the supplier. It is
 * tenable because opencode only calls it — the provider is
 * `@ai-sdk/openai-compatible` and the model catalog is DECLARED in the
 * config (`providerModels`), donc rien ne va chercher `/models` en ligne.
 */
export function resolveProxyTarget(
  method: string | undefined,
  requestTarget: string | undefined,
  baseUrl: string,
): ProxyRoute {
  const completions = chatCompletionsUrl(baseUrl);
  const prefix = completions.replace(/\/chat\/completions$/, "");
  const raw = requestTarget ?? "";

  if (!raw.startsWith("/")) {
    return { ok: false, status: 400, message: "proxy: path must start with '/'" };
  }
  if (raw.includes("#") || raw.includes("..") || raw.includes("//")) {
    return { ok: false, status: 400, message: "proxy: path must not contain '#', '..' or '//'" };
  }

  let url: URL;
  let expected: URL;
  try {
    url = new URL(`${prefix}${raw}`);
    expected = new URL(completions);
  } catch {
    return { ok: false, status: 400, message: "proxy: unreadable path" };
  }
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
    return { ok: false, status: 404, message: "proxy: only the completion route is served" };
  }
  if ((method ?? "").toUpperCase() !== "POST") {
    return { ok: false, status: 405, message: "proxy: the completion route is POST only" };
  }
  return { ok: true, url: url.toString() };
}

/**
 * THE RESPONSE READER — the `id` and the `usage`, read on the fly in an SSE stream.
 *
 * It does not buffer the response: it reads the `data:` lines in passing and does not
 * keeps only two numbers and two strings. One round can render megabytes of
 * text ; retaining them to look for an identifier would be the best way to
 * dropping a microVM to 4 GB on a verbose run.
 */
export class GenerationSniffer {
  private buffer = "";
  private current: CapturedGeneration | null = null;
  private readonly done: CapturedGeneration[] = [];

  /** A piece of response, as it arrives from the supplier. */
  push(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      this.line(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf("\n");
    }
  }

  /** The answer is finite: what remained becomes a generation. */
  end(): void {
    if (this.buffer) {
      this.line(this.buffer);
      this.buffer = "";
    }
    this.flush();
  }

  private line(raw: string): void {
    const line = raw.trim();
    if (!line) return;
    // A NON-streamed response is a single JSON object: the same reading works,
    // parce qu'on ne cherche que des champs de haut niveau.
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!payload || payload === "[DONE]") return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      // Error text, partial frame, SSE comment: nothing to read,
      // and above all nothing that should interrupt the relay.
      return;
    }
    const gen = (this.current ??= {
      id: null,
      model: "",
      outputTokens: null,
      costUsd: null,
      usage: null,
    });
    if (typeof parsed.id === "string" && parsed.id && !gen.id) gen.id = parsed.id;
    if (typeof parsed.model === "string" && parsed.model && !gen.model) gen.model = parsed.model;
    if (parsed.usage) {
      const usage = parseOpenRouterUsage(parsed.usage as OpenRouterUsage);
      gen.usage = usage;
      if (usage.completionTokens != null) gen.outputTokens = usage.completionTokens;
      if (usage.cost != null) gen.costUsd = usage.cost;
    }
  }

  /**
   * A GENERATION WITHOUT ANY TRACE IS NOT ONE (MIN-286).
   *
   * `line()` allocates from the FIRST readable JSON line, without requiring `id` or
   * d'`usage`: an error body from the provider (`{"error":{…}}` on a 429, a
   * error frame in the middle of a 200) therefore produced a ghost generation.
   * It didn't cost anything: `takeGeneration` matches the model, and a
   * ghost has the EMPTY model, so he matches everything and gets caught first —
   * the round left without its invoiced cost nor its `generation_id`, and the real
   * generation remained in the queue until `recordOrphans`, which wrote it once
   * SECOND time. A round billed twice, on an error response.
   */
  private flush(): void {
    const gen = this.current;
    this.current = null;
    if (!gen) return;
    if (gen.id == null && gen.usage == null) return;
    this.done.push(gen);
  }

  /** What has been seen and not yet consumed. */
  captured(): CapturedGeneration[] {
    return this.done;
  }
}

/**
 * THE PAIRING round → generation. Pure, and taken out of the server for that: it's the
 * the only part that could be wrong, therefore the only one that deserves a separate test.
 */
export function takeGeneration(
  pool: CapturedGeneration[],
  round: { model: string; outputTokens: number },
): CapturedGeneration | null {
  const sameModel = (gen: CapturedGeneration) =>
    !gen.model || !round.model || gen.model === round.model || gen.model.endsWith(round.model);
  const exact = pool.findIndex((gen) => sameModel(gen) && gen.outputTokens === round.outputTokens);
  const index = exact !== -1 ? exact : pool.findIndex(sameModel);
  if (index === -1) return null;
  return pool.splice(index, 1)[0];
}

/** Starts the proxy. Returns its URL, build queue, and shutdown. */
export async function startLlmProxy(opts: LlmProxyOptions): Promise<LlmProxy> {
  const { job } = opts;
  const http = opts.fetchImpl ?? fetch;
  /**
   * The COMMON queue, powered by a PER REQUEST reader. A shared drive
   * would mix two responses in flight — and two girls in parallel, that's
   * exactly what the trick does when the model delegates.
   */
  const pool: CapturedGeneration[] = [];
  /** Relays started and not finished — what `settle` expects. */
  let inFlight = 0;

  /**
   * THE KEY, TAKEN BEFORE THE FIRST SERVER BYTE. The port does not exist yet
   * when this line is executed: there is therefore no window during which
   * this proxy listens without knowing what to ask on `authorization`.
   *
   * The failure RISES, and goes back to the end of turn report (`main.ts`): without
   * capped key, a local tour no longer has any spending safeguards — the
   * microVM compute, the last net in the cloud, is structurally worth zero
   * on someone's machine. Better a ride that doesn't leave and says so.
   */
  const apiKeyPromise = opts.apiKey
    ? isLocalAgentProvider(job.provider)
      ? optionalApiKey(opts.apiKey)
      : requireApiKey(opts.apiKey)
    : Promise.resolve<string | null>(null);
  const apiKey = opts.deferApiKey ? null : await apiKeyPromise;

  const server = createServer((req, res) => {
    void relay(req, res).catch((err) => {
      // The proxy is on the critical path of the model: a failure here must occur
      // tell the HTTP client (therefore to opencode, which will try it again), not do
      // fall the process which holds all the trick.
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `proxy: ${(err as Error).message}` } }));
    });
  });

  async function relay(req: IncomingMessage, res: ServerResponse): Promise<void> {
    inFlight++;
    try {
      await relayOnce(req, res);
    } finally {
      inFlight--;
    }
  }

  async function relayOnce(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = resolveProxyTarget(req.method, req.url, job.baseUrl);
    if (!route.ok) {
      // The body is READ ANYWAY before refusing: a client who has started to
      // write and who is responded to without emptying the socket ends up with a
      // connection half consumed, and opencode tries again on a broken pipe.
      await readBody(req).catch(() => {});
      // A refusal here is never trivial: it is either an opencode that has changed
      // route, or someone trying to use the proxy. It can be read in a
      // log, bounded because the request-target comes from opposite.
      console.error(`[llm-proxy] refused ${req.method} ${(req.url ?? "").slice(0, 200)}`);
      res.writeHead(route.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: route.message } }));
      return;
    }
    const raw = await readBody(req);

    // There is only one road left: what happens here IS a completion,
    // and the three gestures that follow no longer have any conditions to carry.
    let body: string | undefined = raw.length > 0 ? raw.toString("utf8") : undefined;
    if (body) {
      try {
        body = JSON.stringify(patchCompletionBody(JSON.parse(body), job));
      } catch {
        // Un corps qu'on ne sait pas lire se relaie TEL QUEL : un round qui part
        // without our complement is infinitely better than a round that doesn't go away.
      }
      // AFTER the complement, and on the WHOLE body: the tools output
      // of opencode enter this body without ever having passed through us
      // (MIN-328). The body that we cannot read is also substituted — the
      // substitution is textual, it does not need to understand the form.
      if (opts.redact) body = opts.redact(body);
    }

    const headers: Record<string, string> = { ...extraHeaders(job) };
    for (const [key, value] of Object.entries(req.headers)) {
      // `host` would designate the proxy; `content-length` is no longer valid after
      // complement ; `accept-encoding` would bring back a compressed body that we
      // would relay without its header (undici decompresses and keeps the header).
      if (
        ["host", "content-length", "connection", "accept-encoding"].includes(key) ||
        // On a machine, opencode always carries the placeholder in this field.
        // Without a local key, relaying it would cause servers that are not waiting to fail
        // no authentication; with key, it crushes it further down.
        (opts.apiKey && key === "authorization")
      ) continue;
      if (typeof value === "string") headers[key] = value;
    }
    // THE KEY CRUSHES THE PLACEHOLDER, and only on this route (MIN-357).
    // Without a key — the case of the microVM — it is the opencode placeholder that leaves,
    // and the firewall replaces it after exit: the line below is the
    // ONLY difference between the two worlds.
    const relayKey = apiKey ?? (opts.apiKey ? await apiKeyPromise : null);
    if (relayKey) headers.authorization = `Bearer ${relayKey}`;

    opts.onTiming?.("llm-upstream-request");
    const upstreamRequest: RequestInit = {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body }),
    };
    let upstream: Response;
    try {
      upstream = await http(route.url, upstreamRequest);
    } catch (error) {
      if (isLocalAgentProvider(job.provider)) {
        throw new Error(
          "local model endpoint is unavailable; check that it is running and that its URL is reachable from this Mac. No cloud provider was used",
        );
      }
      throw error;
    }
    if (upstream.status === 400 && body !== undefined) {
      const retryBody = repairRejectedAiChatBody(body, await upstream.clone().text());
      if (retryBody !== null) {
        body = retryBody;
        upstream = await http(route.url, { ...upstreamRequest, body });
      }
    }
    opts.onTiming?.("llm-upstream-headers");

    const out: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (["content-encoding", "content-length", "transfer-encoding"].includes(key)) return;
      out[key] = value;
    });
    res.writeHead(upstream.status, out);

    if (!upstream.body) {
      res.end();
      return;
    }
    /**
     * ONLY READ RESPONSES THAT ARE SUCCESSFUL. A 4xx/5xx from the supplier carries
     * a JSON body (`{"error":{…}}`) that the reader would take to be the start of a
     * generation: nothing to bill, but one more entry in the queue, at
     * empty model — therefore matchable to any round (see `flush`).
     */
    const sniff = upstream.status < 400;
    const sniffer = new GenerationSniffer();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let firstChunk = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunk) {
        firstChunk = false;
        opts.onTiming?.("llm-upstream-first-byte");
      }
      // We WRITE FIRST: the flow of the model must not wait for our reading.
      res.write(value);
      if (sniff) sniffer.push(decoder.decode(value, { stream: true }));
    }
    if (sniff) {
      sniffer.end();
      pool.push(...sniffer.captured());
    }
    res.end();
  }

  const port = await listen(server, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    take: (round) => takeGeneration(pool, round),
    drain: () => pool.splice(0, pool.length),
    settle: async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // An open SSE flow would keep the server alive: the trick is over, we
        // ne l'attend pas.
        server.closeAllConnections?.();
      }),
  };
}

/**
 * The key to the trick, or nothing at all. The message is what a user will read in
 * his thread when a local tour has not been able to start: he must say the CAUSE,
 * pas « proxy error ».
 */
async function requireApiKey(fetchKey: () => Promise<string | null>): Promise<string> {
  const key = (await fetchKey())?.trim();
  if (!key) throw new Error("llm proxy: no capped model key for this turn");
  return key;
}

/** A lack of key is a contract permitted only for a local endpoint. */
async function optionalApiKey(fetchKey: () => Promise<string | null>): Promise<string | null> {
  return (await fetchKey())?.trim() || null;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}
