import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { ControlPlaneClient } from "./control-plane-client";
import {
  bridgedToolNamesFor,
  DOMAIN_TOOL_NAMES,
  LOCAL_TOOL_NAMES,
  TOOL_ATTACHMENTS_HEADER,
} from "./opencode-tools";
import type { OpencodeDelivery } from "./opencode-delivery";
import type { VmJob } from "./protocol";

/**
 * THE TOOLS BRIDGE (MIN-286, lot 2) — the local server that the 32 tools of
 * generated domain call, and which holds what a tool without memory cannot
 * keep: **the TOUR counters**.
 *
 * The full path of a call: the model calls `web_search` → opencode
 * executes the generated `.opencode/tool/web_search.ts` → this posts on
 * `MDY_SUPERVISOR_URL/tool/web_search` → **here** → `cp.callTool` → the plan
 * control, with the identity given to it by the firewall OIDC. No secrets
 * does not enter the VM, and the generated code does not contain any logic: it posts and
 * il rend ([opencode-tools.ts](opencode-tools.ts)).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS LOCAL JUMP EXISTS, when the tool could call the
 * control directly
 *
 * Because **the control plan counts for nothing**: it charges what it is charged for
 * asks, run by run, and he has no idea what a round is. Gold three
 * Product warranties are TOUR states:
 *
 * 1. **The web search limit** (`webSearchMax`, 5 — `MAX_WEB_SEARCHES_PER_TURN`
 * from [web-search.ts](../../web-search.ts)), shared by the mother and her daughters.
 * Each search costs the Exa package (`WEB_SEARCH_USD_PER_CALL`, $0.005),
 * and a model that searches in circles spends without limit if no one counts.
 * It is also this counter which serves as `seq`: two searches in the same round
 * then write two distinct ledger lines, where an absent `seq`
 * all listed under the same number.
 * 2. **The proofreading anchors already placed** (`prInlineComments`): the ceiling
 * of the 5 is counted over the life of the RUN, the function updates the count to
 * each call, and it must be returned to him on the next one.
 * 3. **Images** (`imageInput`): the control plan only serves as a model
 * if the lathe model can read it.
 *
 * This is exactly what `runVmTurn` held in its closures
 * ([turn.ts](turn.ts)); the bridge is what remains of these closures when the
 * loop that carried them is no longer our code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO RESPONSE RULES, and they are not cosmetic
 *
 * - **A tool failure responds 200**, with `{"error": …}` for body. The model
 * must READ the error and decide (try again, do differently) — that's what
 * was `execTool` on the home loop side. A 5xx would make the generated tool render a
 * transport phrase (“could not reach the harness”) which would mask the real
 * pattern, and an exception would cut the circle: the most expensive way of saying
 * “try again”.
 * - **An unknown name responds 404.** This one is not a model error but
 * from us: a tool served and not routed. He must see himself, not catch up.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE VOICE OF HARNESS (MIN-286, lot 2, task 14)
 *
 * Two tools carry a delivery rule: `write_issue_plan` (the plan reviewed
 * and its closure) and `validate_changes` (type-check, tests, diff). Both make it
 * in `followUp` — what the home loop served in message `user` after the
 * round, for lack of being able to magnify a tool result that it elided by the
 * medium. **At opencode, a result of tool IS the text that the tool renders**,
 * and nothing elides it below the ceilings of `tool_output` (2,000 lines /
 * 50 KB; the largest block, the diff, is capped at 12 KB). The bridge therefore sticks the
 * `followUp` AFTER the result, in the same text: the model reads both of one
 * gesture, without any message being added to the conversation.
 */

/** The body that a tool generated post. `args` is what the template filled in. */
interface ToolCallBody {
  args?: Record<string, unknown>;
  callID?: string;
  sessionID?: string;
}

/**
 * What the supervisor keeps from the bridge. `webSearchesUsed` is read by the tests and
 * by the end of turn report: a ceiling that cannot be reread is a
 * plafond qu'on ne peut pas prouver.
 */
export interface ToolBridge {
  /** `http://127.0.0.1:<port>` — the value of `MDY_SUPERVISOR_URL`. */
  readonly url: string;
  readonly webSearchesUsed: number;
  /** Replay anchors set by this run, up to date from last call. */
  readonly prInlineComments: number;
  close(): Promise<void>;
}

/**
 * A tool that the SUPERVISOR runs himself, because he has something that
 * neither the control plane nor opencode have — the repository, for `create_pr` (the VM
 * pushes, the function opens).
 */
export type SupervisorTool = (args: Record<string, unknown>) => Promise<{
  result: unknown;
  success: boolean;
  followUp?: string;
  reason?: string;
}>;

/**
 * What a call returns to the bridge. `images` is the only output that is not
 * text: it becomes a message attachment with opencode (see `forwardRaw`).
 */
interface ToolOutcome {
  result: unknown;
  success: boolean;
  followUp?: string;
  images?: Array<{ url: string; name?: string }>;
  /**
   * A structured failure reason for `agent_run_events`. Resource ceilings and
   * transport failures remain measurable even though commands are not classified.
   */
  reason?: string;
}

export interface ToolBridgeOptions {
  job: VmJob;
  cp: ControlPlaneClient;
  /** Per-turn bearer token required on every generated tool request. */
  authorizationToken: string;
  /**
   * The delivery rules ([opencode-delivery.ts](opencode-delivery.ts)).
   * Tests may omit delivery behavior, but authentication is always required.
   */
  delivery?: OpencodeDelivery;
  /**
   * The tools that the supervisor executes instead of forwarding them:
   *
   * - `create_pr`, because it PUSHES before opening;
   * - `run_background`, which never leaves the microVM (LOCAL tool, §3.2): the
   * job register lives in the supervisor, which kills them before each
   * `git add -A` and at the end of the round.
   *
   * Absent, the tool is REFUSED rather than passed as is — a `create_pr` which
   * would reach the forge without the VM having pushed would open a pull request on
   * an empty branch. This is the case of a rereading session, which does not push
   * never and never throws anything in the background.
   */
  supervisorTools?: Record<string, SupervisorTool>;
  /**
   * A tool refused BY THE HARNESS, with its motive — the counterpart, on the tools side
   * local, what the permission verdict renders for integrated tools. THE
   * supervisor bases it on the `tool_result` event of this call.
   */
  onToolRefused?: (callId: string, reason: string) => void;
  /** 0 = free port chosen by the OS. The supervisor reads the rendered URL. */
  port?: number;
}

/**
 * The tools that the bridge does NOT follow the control plane without more. All this
 * which is not in there is a hatch, and this is the most common case:
 * reading a ticket or writing a page doesn't need any tower state.
 */
const SUPERVISOR_ONLY = new Set([
  "create_pr",
  "validate_changes",
  "run_background",
  "update_plan",
  "list_projects",
]);

/** Starts the bridge. The supervisor opens it BEFORE the opencode server. */
export async function startToolBridge(
  opts: ToolBridgeOptions,
): Promise<ToolBridge> {
  const { job, cp } = opts;
  const allowedTools = bridgedToolNamesFor(job);

  /**
   * Web searches already paid for by this TOUR, mother and daughters combined — the same
   * shared meter that the house loop held (MIN-171), in the same place
   * logic: the only point through which all research passes.
   */
  let webSearchesUsed = 0;
  let prInlineComments = job.prInlineComments;
  let quotaTail: Promise<void> = Promise.resolve();

  const withQuotaLock = async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = quotaTail;
    let release!: () => void;
    quotaTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  };

  /**
   * THE RESEARCH CEILING, and the refusal it gives.
   *
   * The refusal is a ORDINARY tool response (`success: false`), not a
   * transport error: the model reads it, understands that it has exhausted its quota of
   * searches and works with what he has. The sentence is that of `turn.ts`, at
   * word for word — the switching criterion for batch 3 is that the thread tells the same
   * thing on both sides, and the text of a `tool_result` is one of them.
   */
  async function runWebSearch(
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; success: boolean }> {
    if (!job.webSearch) {
      // The tool is not generated in this case (`agentToolsFor` removes it outside
      // OpenRouter): getting there anyway means that a previous round has
      // left his file behind. We refuse, we do not pay.
      return {
        result: { error: "Web search is not available on this run." },
        success: false,
      };
    }
    if (webSearchesUsed >= job.webSearchMax) {
      return {
        result: {
          error: `Web search limit reached for this turn (${job.webSearchMax} searches). Work with what you already found.`,
        },
        success: false,
      };
    }
    const seq = webSearchesUsed++;
    const res = await cp.callTool("web_search", {
      args: { query: args.query, seq },
    });
    return { result: res.result, success: res.success };
  }

  /** The pass-through: the tower states go with it, and come back up to date. */
  async function forwardRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolOutcome> {
    const res = await cp.callTool(name, {
      args,
      imageInput: job.imageInput,
      prInlineComments,
    });
    // The anchor counter goes back and forth: it is the function which opposes it
    // at the ceiling of 5 and which returns the one it has reached (`runPrTool`).
    if (typeof res.inlineUsed === "number") prInlineComments = res.inlineUsed;
    /**
     * THE IMAGES of `read_resource` cross this bridge from MIN-286 lot 3.
     *
     * The result of an opencode tool is TEXT — but its rich `ToolResult`
     * carries `attachments`, and opencode republishes them in part `image_url`
     * of a message `user` placed just after the round (“Attached media from tool
     * result:"). This is exactly what the home loop did on its side,
     * and the request body is the same (measured, file §2.22).
     *
     * We do not filter on `job.imageInput` here: it is the control plane which
     * decides to serve the image or not — we asked him for it with this flag
     * (`issue-tools.ts`), and an image that still arrives is an image that
     * the model can read.
     */
    return {
      result: res.result,
      success: res.success,
      ...(res.images?.length ? { images: res.images } : {}),
    };
  }

  /**
   * The serving hatch UNDER the delivery rules: `write_issue_plan` notes the
   * written plan and leaves with its rereading in `followUp`. Wrapped once,
   * startup — wrapping it by call would make a new plan sink each time
   * times, therefore a control that never speaks.
   */
  const forward = opts.delivery
    ? opts.delivery.wrapDomainTool(forwardRaw)
    : forwardRaw;

  /**
   * `create_pr` is a supervisor-only publishing operation. `validate_changes` is
   * wrapped separately so the explicit preflight cannot be mistaken for publication.
   */
  const supervisorTools: Record<string, SupervisorTool> = {
    ...opts.supervisorTools,
  };
  if (opts.delivery && supervisorTools.validate_changes) {
    supervisorTools.validate_changes = opts.delivery.wrapValidateChanges(
      supervisorTools.validate_changes,
    );
  }

  async function dispatch(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolOutcome | null> {
    if (!allowedTools.has(name)) {
      if (DOMAIN_TOOL_NAMES.has(name) || LOCAL_TOOL_NAMES.has(name)) {
        return {
          result: { error: `${name} is not available on this turn.` },
          success: false,
        };
      }
      return null;
    }
    const own = supervisorTools[name];
    if (own) return await own(args);
    if (SUPERVISOR_ONLY.has(name)) {
      return {
        result: { error: `${name} is not available on this turn.` },
        success: false,
      };
    }
    if (name === "web_search")
      return await withQuotaLock(() => runWebSearch(args));
    if (!DOMAIN_TOOL_NAMES.has(name)) return null;
    if (name === "comment_pr_line" || name === "comment_pull_request_line") {
      return await withQuotaLock(() => forward(name, args));
    }
    return await forward(name, args);
  }

  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${opts.authorizationToken}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized tool bridge request" }));
      return;
    }
    void handle(req, res).catch((err) => {
      // A failure of the bridge itself (unreadable body, cut socket): it is said
      // to the model as a tool error, never by crashing the process
      // which holds all the way around.
      if (!res.headersSent)
        res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: `minddy tool bridge: ${(err as Error).message}`,
        }),
      );
    });
  });

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    const name = path.startsWith("/tool/")
      ? decodeURIComponent(path.slice("/tool/".length))
      : "";
    if (req.method !== "POST" || !name) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const raw = await readBody(req);
    let body: ToolCallBody = {};
    try {
      body = raw.length
        ? (JSON.parse(raw.toString("utf8")) as ToolCallBody)
        : {};
    } catch {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "minddy tool bridge: malformed request body" }),
      );
      return;
    }

    let outcome: ToolOutcome | null;
    try {
      outcome = await dispatch(name, body.args ?? {});
      // The reason for the refusal goes to the supervisor, who alone writes on the wire: the bridge, itself,
      // only knows HTTP. `callID` is that of opencode, therefore the one that carries
      // l'event `tool_result` de cet appel.
      if (outcome?.reason && body.callID)
        opts.onToolRefused?.(body.callID, outcome.reason);
    } catch (err) {
      // The control plane failed (409, failure, timeout). The model must
      // read: a tool in error tries again, a cut round pays for itself.
      outcome = {
        result: { error: `${name} failed: ${(err as Error).message}` },
        success: false,
      };
    }
    if (!outcome) {
      // A tool served to the model and routed nowhere: this is our default, and it
      // must be seen in the VM logs as much as in the conversation.
      console.error(`[tool-bridge] unrouted tool: ${name}`);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `unknown minddy tool: ${name}` }));
      return;
    }

    // `JSON.stringify` of the result, as is: this is what the house loop
    // gave to the model, and a second formatting would be a second thing
    // to keep in phase during the shift. The voice of the harness comes
    // AFTER, in text: the model reads a result then what we have to tell it about it.
    const rendered = JSON.stringify(
      outcome.result ?? (outcome.success ? {} : { error: "no result" }),
    );
    const output = outcome.followUp
      ? `${rendered}\n\n${outcome.followUp}`
      : rendered;

    /**
     * AN IMAGE → THE ENVELOPE, and it is announced by its header (cf.
     * `TOOL_ATTACHMENTS_HEADER`). The generated tool then renders a rich `ToolResult`
     * rather than a string, and opencode publishes the mock as an attachment.
     *
     * The TEXT of the response does not change by one byte however: the form
     * The name of the file remains what the model reads, the image is ADDED to it. A
     * wire will therefore tell the same thing on both sides of the seesaw.
     */
    if (outcome.images?.length) {
      res.writeHead(200, {
        "content-type": "application/json",
        [TOOL_ATTACHMENTS_HEADER]: String(outcome.images.length),
      });
      res.end(
        JSON.stringify({
          output,
          attachments: outcome.images.map((image) => ({
            type: "file",
            // The data URL carries its own MIME type; outside of this case we don't know
            // not, and `application/octet-stream` is better than a `image/png`
            // asserted randomly — opencode decides the modality on that.
            mime: mimeOfDataUrl(image.url) ?? "application/octet-stream",
            url: image.url,
            ...(image.name ? { filename: image.name } : {}),
          })),
        }),
      );
      return;
    }

    res.writeHead(200, {
      "content-type": outcome.followUp
        ? "text/plain; charset=utf-8"
        : "application/json",
    });
    res.end(output);
  }

  const port = await listen(server, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    get webSearchesUsed() {
      return webSearchesUsed;
    },
    get prInlineComments() {
      return prInlineComments;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

/**
 * The MIME type of a data URL, or `null`. Our images are always
 * ([content.ts](../content.ts): never a signed URL, because the history is
 * replayed hours later) — but reading it rather than assuming it costs a
 * line, and a signature that changes would be seen here rather than in production.
 */
function mimeOfDataUrl(url: string): string | null {
  const match = /^data:([^;,]+)[;,]/.exec(url);
  return match ? match[1] : null;
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
