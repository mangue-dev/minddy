import type { OpencodeEvent } from "./opencode-events";

/**
 * THE OPENCODE SERVER CLIENT (MIN-286, batch 1) — the only place in the repository that
 * knows its URLs.
 *
 * WHY A MODULE FOR THAT, and it's not a simple matter: **the same binary
 * serves TWO generations of API**, `/session/*` (legacy) and `/api/session/*` (v2),
 * and they do not have the same routes. A fault of a segment does not render a 404
 * but **the HTML page of the TUI** - therefore a `JSON.parse` which explodes on `<!doctype`,
 * at three o'clock in the morning, in a two-hour round. Isolating the two prefixes
 * here is what makes the fault only happen once.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * MEASURED ON `opencode-ai@1.18.16` (and a colon corrects batch 0 record)
 *
 * - **`POST /api/session/:id/wait` responds 503**: "Session wait is not available
 * yet". The route exists in the OpenAPI, the server does not implement it. The
 * file gave her as the v2 half of the prompt/wait couple — she is
 * not. We therefore wait for the end of a turn on **`session.idle` of the flow `/event`**,
 * which we consume anyway, and it's better: no HTTP request remains open for hours.
 * - **The response to a permission is `POST /permission/:id/reply`**, body
 * `{reply: "once"|"always"|"reject", message?}` — measured 200 `true` (lot 2).
 * `/session/:id/permissions/:permissionID` still works but is `deprecated`
 * and has no `message`: it is this field which carries the reason for refusal to the
 * model, so it is the first route that counts.
 * - **A cut publishes `session.error` `MessageAbortedError`**: a `abort`
 * wanted (ceiling, question, deadline) is not a failure
 * ([opencode-events.ts](opencode-events.ts) the filter).
 * - `POST /session/:id/prompt_async` returns **204** immediately.
 * - `POST /session/:id/abort` returns **200 `true`**, even on an idle session.
 * - `POST /session` makes the session complete (`id`, `projectID`, `directory`…).
 * - **`?directory=` is mandatory** on legacy routes: without it, the
 * server works in its own cwd, not in the run repository.
 */

/** What an opencode session renders when it is created. */
export interface OpencodeSession {
  id: string;
  projectID?: string;
  directory?: string;
}

/** Possible response to a permission request. */
export type PermissionResponse = "once" | "always" | "reject";

export interface OpencodeClientOptions {
  /** `http://127.0.0.1:<port>`, sans slash final. */
  baseUrl: string;
  /** The repository: `?directory=` of all inherited routes. */
  directory: string;
  /** Injected for testing. Default: the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** HTTP Basic credentials configured on the per-turn server. */
  auth?: { username: string; password: string };
  /** Finite-request timeout override for tests. */
  requestTimeoutMs?: number;
}

/**
 * Cap on ONE health probe. The server responds in ~20 ms when it is ready;
 * what is limited here is the connection accepted but left without response.
 */
const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** Cadence of log lines while waiting for startup. */
const HEALTH_PROGRESS_INTERVAL_MS = 15_000;

/**
 * Maximum duration of a finite OpenCode HTTP exchange. The event stream is
 * intentionally excluded because it remains open for the whole turn.
 */
export const OPENCODE_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The local process goes from "connection refused" to ready in less than a second.
 * At 200 ms, the loop added up to 200 ms of pure latency after this moment.
 * 50 ms remains derisory in number of probes (around twenty at worst cold) and
 * returns startup visibly more responsive.
 */
const HEALTH_RETRY_MS = 50;

export class OpencodeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly route: string,
    body: string,
  ) {
    super(`${route} → ${status}: ${body.slice(0, 300)}`);
    this.name = "OpencodeHttpError";
  }
}

export class OpencodeClient {
  private readonly base: string;
  private readonly directory: string;
  private readonly http: typeof fetch;
  private readonly authorization: string | null;
  private readonly requestTimeoutMs: number;

  constructor(opts: OpencodeClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.directory = opts.directory;
    this.http = opts.fetchImpl ?? fetch;
    this.authorization = opts.auth
      ? `Basic ${Buffer.from(`${opts.auth.username}:${opts.auth.password}`).toString("base64")}`
      : null;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? OPENCODE_REQUEST_TIMEOUT_MS;
  }

  /** An INHERITANCE route (`/session/…`), always with `?directory=`. */
  private legacy(path: string): string {
    const sep = path.includes("?") ? "&" : "?";
    return `${this.base}${path}${sep}directory=${encodeURIComponent(this.directory)}`;
  }

  private async json<T>(route: string, init?: RequestInit): Promise<T> {
    const res = await this.finiteRequest(route, init);
    const text = await res.text();
    if (!res.ok) throw new OpencodeHttpError(res.status, route, text);
    // A misspelled route returns the TUI page, not a 404: the message
    // should say THIS, not “Unexpected token < in JSON”.
    if (text.trimStart().startsWith("<")) {
      throw new OpencodeHttpError(res.status, route, "réponse HTML : la route n'existe pas");
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async request(route: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (this.authorization) headers.set("authorization", this.authorization);
    return await this.http(route, { ...init, headers });
  }

  private async finiteRequest(
    route: string,
    init?: RequestInit,
  ): Promise<Response> {
    return await this.request(route, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  /**
 * Is the server responding? Returns `false` rather than raising.
 *
 * THE PROBE HAS ITS OWN CEILING, and this is what was missing in the first run of
 * production (2026-08-12): a server that ACCEPT the connection without responding
 * left the `fetch` hang until `headersTimeout` of undici — **300 s** —,
 * therefore well after the deadline that `waitHealthy` believes it will meet. The run died at
 * 6:30 on a message that said 60 sec, and nothing in the thread could tell
 * that. Without this cap, the polling loop is not a poll: it makes A
 * request and waits five minutes.
 */
  async healthy(timeoutMs = HEALTH_PROBE_TIMEOUT_MS): Promise<boolean> {
    try {
      const body = await this.json<{ healthy?: boolean }>(`${this.base}/global/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return body.healthy === true;
    } catch {
      return false;
    }
  }

  /**
 * Waits until the server is ready. Measured at batch 0: ~1.3s cold in the
 * microVM — but it was an ALREADY HOT microVM. On a new VM, the disk
 * is lazily hydrated and the first exec of the 176 MB of binary is paid for
 * in minutes: the ceiling therefore does not limit the normal slowness, it limits the
 * server which will never start.
 *
 * Returns the time actually expected, because it is he who an error report
 * must quote: "not ready in 60,000 ms" on a six-minute wait sends
 * looking for the fault in the wrong place.
 */
  async waitHealthy(timeoutMs: number, sleep = defaultSleep): Promise<boolean> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let announced = 0;
    while (Date.now() < deadline) {
      if (await this.healthy()) return true;
      const waited = Date.now() - startedAt;
      // One line every 15 s: enough to read, in the microVM logs, if
      // the server took a long time or never responded — both are corrected
      // elsewhere, and nothing else distinguishes them afterwards.
      if (waited - announced >= HEALTH_PROGRESS_INTERVAL_MS) {
        announced = waited;
        console.log(`[opencode] still waiting for the server (${Math.round(waited / 1000)} s)`);
      }
      await sleep(HEALTH_RETRY_MS);
    }
    return false;
  }

  async createSession(title?: string): Promise<OpencodeSession> {
    return await this.json<OpencodeSession>(this.legacy("/session"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    });
  }

  /**
 * Forces the catalog to be loaded before the prompt.
 *
 * OpenCode otherwise builds the tools, their schemas and the configuration of the
 * model at the first prompt. On the measured local path, this job delayed
 * the first provider call by about 800 ms. The route is precisely
 * the one that the OpenCode interface uses to expose the catalog; reading the
 * body to the end ensures that the loading is actually complete.
 */
  async warmTools(model: string, provider = "minddy", agent = "build"): Promise<void> {
    const query = new URLSearchParams({ provider, model, agent });
    const route = this.legacy(`/experimental/tool?${query.toString()}`);
    const res = await this.finiteRequest(route);
    const body = await res.text();
    if (!res.ok) throw new OpencodeHttpError(res.status, route, body);
  }

  /**
 * Posts a turn and returns the hand RIGHT AWAY (204). The end of the round reads
 * `session.idle` from the event stream — `/api/session/:id/wait` responds 503 on
 * this version, and a two-hour blocking request would be a bad idea anyway.
 */
  async promptAsync(sessionId: string, text: string): Promise<void> {
    const route = this.legacy(`/session/${sessionId}/prompt_async`);
    const res = await this.finiteRequest(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text }] }),
    });
    if (!res.ok) throw new OpencodeHttpError(res.status, route, await res.text());
  }

  /**
   * Cuts the turn in flight. Returns whether OpenCode acknowledged the cut so
   * callers can avoid checkpointing a session that may still be mutating.
   */
  async abort(sessionId: string): Promise<boolean> {
    const route = this.legacy(`/session/${sessionId}/abort`);
    try {
      const response = await this.finiteRequest(route, { method: "POST" });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
 * Responds to a permission request. The supervisor auto-grants model actions;
 * this transport remains necessary for OpenCode's request lifecycle.
 *
 * `POST /permission/:id/reply`, body `{reply, message?}` — measured 200 `true`.
 * NOT `/session/:id/permissions/:id`, which still exists but is marked
 * `deprecated` in the OpenAPI **and does not accept `message`**: it is this
 * field carries an optional message when the transport cannot grant a request.
 */
  async replyPermission(
    permissionId: string,
    reply: PermissionResponse,
    message?: string,
  ): Promise<void> {
    const route = this.legacy(`/permission/${permissionId}/reply`);
    const res = await this.finiteRequest(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply, ...(message ? { message } : {}) }),
    });
    if (!res.ok) throw new OpencodeHttpError(res.status, route, await res.text());
  }

  /**
 * ANSWERS a template question — the machine path (MIN-364, D7).
 *
 * `POST /question/:id/reply`, body `{answers}`: one list per question, in
 * the order they were asked, each bearing the chosen labels.
 * Measured on `opencode-ai@1.18.16` ([opencode-wait.probe.test.ts](opencode-wait.probe.test.ts)):
 * **200 `true`, the call BLOCKS without timeout as long as no one responds, and y
 * answering does NOT end the round** — the tool `question` returns `completed`
 * (“User has answered your questions: …”) and the round returns to the model.
 *
 * The binary schema does not validate labels against options offered
 * (`QuestionAnswer = Array(String)`): a FREE TEXT answer — the one that the
 * question card composes when the user types “Something else…” — travel
 * as is up to the model.
 */
  async replyQuestion(questionId: string, answers: string[][]): Promise<void> {
    const route = this.legacy(`/question/${questionId}/reply`);
    const res = await this.finiteRequest(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) throw new OpencodeHttpError(res.status, route, await res.text());
  }

  /**
 * Removes a question from the model - the path of the MICROVM, and that of any
 * turn exit ("Stop", deadline, ceiling) which finds a question in flight.
 * The tool must be resolved for the history to remain matched - measured: it
 * returns to `error`, "The user dismissed this question”.
 */
  async rejectQuestion(questionId: string): Promise<void> {
    const route = this.legacy(`/question/${questionId}/reject`);
    await this.finiteRequest(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
  }

  /**
 * The history in EVENTS, for recovery on another microVM (probe du
 * batch 0). Incremental: `{aggregateID: dernier_seq}` only returns the result.
 *
 * TRAP, and it is in the schema, not in our code: the export returns du
 * **snake_case** (`aggregate_id`) and the replay expects du **camelCase**
 * (`aggregateID`). Hence `normalizeSyncEvents`.
 */
  async syncHistory(since: Record<string, number> = {}): Promise<Record<string, unknown>[]> {
    const body = await this.json<{ events?: Record<string, unknown>[] } | Record<string, unknown>[]>(
      this.legacy("/sync/history"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(since),
      },
    );
    const events = Array.isArray(body) ? body : (body.events ?? []);
    // NORMALIZED FROM READING, and that's what bit: the export cursor is
    // derives from `aggregateID`, which this answer does not have. Leave the snake_case
    // circulating gave an EMPTY cursor — therefore a complete export each turn,
    // which grows until it no longer passes, without any test falling.
    return normalizeSyncEvents(events as Record<string, unknown>[]);
  }

  async syncReplay(events: Record<string, unknown>[]): Promise<void> {
    if (events.length === 0) return;
    await this.json(this.legacy("/sync/replay"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory: this.directory, events: normalizeSyncEvents(events) }),
    });
  }

  /**
 * The `/event` stream, in asynchronous iterator. Each `data:` is an event.
 *
 * What is NOT here: the translation. It lives in a pure
 * ([opencode-events.ts](opencode-events.ts)) module that we test on captured
 * fixtures — a network flow is not replayed in a unit test.
 */
  async *events(signal?: AbortSignal): AsyncGenerator<OpencodeEvent> {
    const res = await this.request(this.legacy("/event"), { signal });
    if (!res.ok || !res.body) {
      throw new OpencodeHttpError(res.status, "/event", "flux d'events indisponible");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by an empty line; a frame can hold
      // on several `data:` lines, but opencode only emits one per frame.
      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        index = buffer.indexOf("\n\n");
      }
    }
  }
}

/** An SSE frame → an event, or `null` (comment, ping, unreadable JSON). */
export function parseFrame(frame: string): OpencodeEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as OpencodeEvent;
    return typeof parsed?.type === "string" ? parsed : null;
  } catch {
    // A third-party stream that sends an unreadable frame should not kill the round.
    return null;
  }
}

/**
 * `aggregate_id` → `aggregateID`. The trap of §2.2 of the file, and it is in the
 * Opencode SCHEME: export returns snake_case, replay expects camelCase.
 * Without that, resuming a session on another microVM fails validation.
 */
export function normalizeSyncEvents(
  events: Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.map((event) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event)) {
      out[key === "aggregate_id" ? "aggregateID" : key] = value;
    }
    return out;
  });
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
