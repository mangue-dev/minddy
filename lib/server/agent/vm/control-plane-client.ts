import { agentVmUrl } from "../network-policy";
import type { AgentCheckpoint } from "../runs";
import type {
  AgentEventType,
  AgentLiveDiff,
  AgentLiveProgress,
  AgentUsageLine,
  PlanStep,
} from "../agent-contract";
import type { VmToolResponse, VmTurnReport } from "./protocol";
import type { AgentUserMessage } from "@/lib/agent-mentions";

/**
 * THE VM SIDE OF THE CONTROL PLANE (MIN-224) — the only door through which the
 * loop, from the microVM, touches the base, the ledger, the tickets, the notebook and
 * the forge.
 *
 * WHAT MAKES IT WORK WITHOUT ANY SECRET, IN A MICROVM. The VM does not carry
 * nothing: no Supabase key, no identity token. She calls OUR OWN
 * ORIGIN in https, and the Vercel Sandbox firewall forwards the request to the
 * collection route by adding an OIDC signed by the platform, including the claim
 * `sandbox_name` is `agent-<run.id>`. The `runId` is therefore NEVER in the
 * body: it is derived from this claim on the server side, and the VM cannot claim anything
 * other than his own run. There is no authentication header to set, and
 * This is normal — there is none.
 *
 * AND ON A MACHINE, YOU NEED TO INSTALL ONE (MIN-355). No firewall signs for
 * a harness that runs on a Mac: it then carries an HS256 `{rid, gen, exp}` token
 * that the server signed, and `getToken` is where it comes in. Two points which have
 * seem like details and are not:
 *
 * - **`emitLive` places its headers in a SECOND place** (its detached `fetch`, more
 * down). The token placed on `request()` but not on it would give a turn which
 * results, a thread that no longer streams for hours, and zero errors — the
 * `catch` is empty by design;
 * - **a GETTER, not a string.** The token lasts fifteen minutes and a turn lasts
 * hours: it will be renewed under the harness (MIN-294), and it is this joint which
 * allows it without changing anything else here.
 *
 * THE DISCIPLINE OF THIS MODULE, and it is worth saying: **nothing that is
 * best-effort must be able to kill a round.** A lost event is recovered by polling
 * the thread; a dead turn due to a lost event is not. Hence the separation into two
 * families:
 *
 * - `postQuiet` — events, direct, ledger, periodic checkpoint: errors
 * are logged and swallowed;
 * - `request` — tools, end checkpoint, end of turn report: errors
 * RISING, because a tool that fails must tell itself to the model, and a
 * end of lost turn report is a lost turn.
 *
 * DIRECT (`/stream`) IS THE ONLY EXPENSIVE POINT, and it is encrypted: `emitLive`
 * broadcasts ~4×/s, or ~2,400 calls over a ten-minute shift. The framing has
 * measured the round trip at ~55 ms and decided: we keep 250 ms for v1 and we
 * MEASURE. This is also why he does not expect — cf. `emitLive` below.
 */

/** How many times do we retry a control plane call before giving up. */
const MAX_ATTEMPTS = 3;
/** Base wait between two trials (doubled each time). */
const RETRY_BASE_MS = 400;
/**
 * Ceiling of a control plane call. Large compared to the ~55 ms measured, but
 * BOUNDED: without it, a `fetch` that never surrenders the hand would freeze a turn of
 * several hours on an event request.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Error of a control plane surface, with its status — the caller has it
 * need to distinguish “the run is no longer in progress” (409) from a breakdown. */
export class ControlPlaneError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Is a status worth trying again? The 5xx and the 429, yes — the function could
 * be recycled, or the deployment restarted. The 4xx, no: too big a body
 * or an unfamiliar surface will not improve on the second try, and trying again will not
 * would only delay the error for the caller to read.
 */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface ControlPlaneClient {
  emit(type: AgentEventType, payload: Record<string, unknown>): Promise<void>;
  /** The LOOP type, not a copy: the load is serialized as is
   *  (`JSON.stringify(progress)`), so every field absent here would pass through
   * same — until one day someone whitelists it and loses it. */
  emitLive(progress: AgentLiveProgress): void;
  /** Local Git diff, sent separately from the text stream so as not to copy
   * up to 240 KB four times per second. Best-effort like live. */
  emitDiff(diff: AgentLiveDiff): void;
  recordUsage: (line: AgentUsageLine) => Promise<void>;
  /**
   * Periodic backup. Does not raise — but returns `false` when the plan
   * control responded 409: the run is NO LONGER `running` (cancelled, or concluded by
   * someone else). This is the only signal that reaches a VM whose
   * conversation has been closed under it, and the caller must stop.
   */
  saveCheckpointQuietly(checkpoint: AgentCheckpoint): Promise<boolean>;
  /**
   * PUSH AN INCREMENT OF THE OPENCODE LOG (MIN-286, 2026-08-13).
   *
   * LIFT in case of failure, unlike comfort surfaces: what is lost
   * here is the MEMORY of the session, and the supervisor cursor should not
   * move forward on a batch that is not written — otherwise the journal leaves a hole, and
   * `/sync/replay` refuses a non-contiguous sequence.
   */
  appendJournal(sessionId: string, events: Record<string, unknown>[]): Promise<void>;
  pullSteering(): Promise<AgentUserMessage[]>;
  /**
   * RETURN IN FILE what we drained without knowing how to play it — `pullSteering`
   * consumes, and a turn that exits before having reposted would carry the message
   * in the death of his microVM. Reinserted without an author, they become again
   * pending messages: the run re-queues, and the next round delivers them.
   */
  pushSteering(texts: AgentUserMessage[]): Promise<void>;
  /**
   * Is there any message left that is NOT CONSUMED? Probe of the expectation of a sub-agent: she
   * does not DRAIN, unlike `pullSteering` — the message must remain in queue
   * so that the next round injects it into the history.
   */
  hasPendingMessages(): Promise<boolean>;
  checkInterrupt(): Promise<boolean>;
  /**
   * CLEARS the interrupt flag. Called by the loop when the “stop” it
   * just read arrived with a message: the tour then continues in this
   * this turn, instead of going out to be re-queued by the message remaining in queue.
   */
  clearInterrupt(): Promise<void>;
  /**
   * What this round STILL has the right to spend, reread now — the tightest
   * of the monthly remainder of the account and the run ceiling. `null` = unknown (read
   * broken) or no applicable limit: the caller keeps his current limit.
   *
   * Exists because nothing reserves budget: two competing runs read the
   * same remaining and each take it as a ceiling. The old form read back to
   * each chunk, so at worst every five minutes; a round of microVM lasts
   * hours, and without this surface his ceiling would be blind from start to finish.
   */
  budgetRemaining(): Promise<number | null>;
  syncPlan(steps: PlanStep[]): Promise<void>;
  /** A PLATFORM tool (ticket, notebook, pull request, web search, PR). */
  callTool(name: string, body: Record<string, unknown>): Promise<VmToolResponse>;
  /** Refresh trusted Git authentication; a safe URL is returned only for legacy callers. */
  repoAuthUrl(): Promise<string | null>;
  /**
   * THE KEY TO THE MODEL OF A LOCAL TOUR (MIN-357), minted to hard ceiling for this run.
   *
   * RISE, and it is the exact opposite of its neighbor `repoAuthUrl`: this one has a
   * fallback (the token that the job already carries), this one has none — there is no
   * no keys anywhere else, and there shouldn't be any. A 503 here means “this
   * deployment does not know how to peak", and the only correct behavior is that the
   * tour does not leave rather than leaving without a ceiling.
   *
   * It is ONLY called on the local path: a microVM does not need it
   * (the firewall installs the key after its exit) and would be refused. `null` is
   * reserved for local endpoints without authentication.
   */
  llmKey(): Promise<string | null>;
  /** The end of turn report. He is the one who puts the session to rest. */
  reportTurn(report: VmTurnReport): Promise<void>;
}

export function createControlPlaneClient(
  appOrigin: string,
  /**
   * The local execution token, RE-READ ON EACH CALL (MIN-355). Absent in microVM,
   * where there is nothing to wear. Making `null` amounts to calling without a header: the
   * route then responds 403, which is exactly what should happen.
   */
  getToken?: () => string | null | undefined,
): ControlPlaneClient {
  const url = (surface: string) => agentVmUrl(appOrigin, surface);

  /** The ONLY place that makes the header, for both of its consumers. */
  function authHeaders(): Record<string, string> {
    const token = getToken?.();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  async function request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    surface: string,
    body?: unknown,
  ): Promise<unknown> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url(surface), {
          method,
          headers: {
            ...authHeaders(),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return await res.json().catch(() => ({}));
        const text = (await res.text().catch(() => "")).slice(0, 400);
        const err = new ControlPlaneError(res.status, `${method} ${surface} → ${res.status}: ${text}`);
        if (!retryable(res.status) || attempt === MAX_ATTEMPTS) throw err;
        lastError = err;
      } catch (e) {
        // An unretryable `ControlPlaneError` has already been restarted above;
        // what happens here is a transport failure (DNS, TLS, timeout), and
        // this one is repeated.
        if (e instanceof ControlPlaneError && !retryable(e.status)) throw e;
        lastError = e as Error;
        if (attempt === MAX_ATTEMPTS) throw lastError;
      }
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
    throw lastError ?? new Error(`${method} ${surface} failed`);
  }

  /** What the loss of which can be made up for: we journal and we continue. */
  async function postQuiet(surface: string, body: unknown): Promise<void> {
    try {
      await request("POST", surface, body);
    } catch (err) {
      console.error(`[agent-vm] ${surface} failed:`, (err as Error).message);
    }
  }

  return {
    emit: (type, payload) => postQuiet("/events", { type, payload }),

    /**
     * SYNCHRONOUS and DETACHED, exactly as `broadcastRunStream` is in the
     * function: the loop calls this in the middle of an LLM stream, four times per
     * second. Waiting for it would make the control plane latency pay for each
     * fragment of text — and live has no value in delay.
     *
     * The empty `catch` is not an oversight: it is the only call of this
     * file whose loss is not recovered or usefully logged (a
     * error line every 250 ms would drown the lap logs).
     *
     * This is also what makes the token easy to forget HERE (MIN-355): without
     * `authHeaders()` on this line, a local tour would normally succeed and would not
     * would stream nothing for hours, without an error anywhere.
     */
    emitLive: (progress) => {
      void fetch(url("/stream"), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(progress),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch(() => {});
    },

    emitDiff: (diff) => {
      void postQuiet("/diff", diff);
    },

    recordUsage: (line) =>
      postQuiet("/usage", {
        seq: line.seq,
        feature: line.feature,
        model: line.model,
        generationId: line.generationId,
        promptTokens: line.promptTokens,
        completionTokens: line.completionTokens,
        totalTokens: line.totalTokens,
        cachedTokens: line.cachedTokens,
        cacheWriteTokens: line.cacheWriteTokens,
        cost: line.cost,
        estimated: line.estimated,
        // `runId`, `billTo` and `projectId` are NOT sent: the
        // controls run line drift. The VM does not choose who pays
        // what she spends.
      }),

    appendJournal: async (sessionId, events) => {
      if (events.length === 0) return;
      await request("POST", "/journal", { sessionId, events });
    },

    saveCheckpointQuietly: async (checkpoint) => {
      try {
        await request("PUT", "/checkpoint", { checkpoint });
        return true;
      } catch (err) {
        if (err instanceof ControlPlaneError && err.status === 409) {
          console.error("[agent-vm] run is no longer running — stopping");
          return false;
        }
        console.error("[agent-vm] periodic checkpoint failed:", (err as Error).message);
        return true;
      }
    },

    /**
     * DON’T RISE, and that’s a choice. These two are called to the top of each
     * round and during streams: a temporary failure of the control plane would
     * fall a two-hour lap for not knowing how to read an empty line. A
     * steering message read in the next round is one second late; a ride
     * death is a trick to repeat.
     */
    pullSteering: async () => {
      try {
        const body = (await request("GET", "/messages")) as { messages?: unknown };
        return Array.isArray(body.messages) ? (body.messages as AgentUserMessage[]) : [];
      } catch (err) {
        console.error("[agent-vm] steering read failed:", (err as Error).message);
        return [];
      }
    },

    pushSteering: async (texts) => {
      if (texts.length === 0) return;
      try {
        await request("POST", "/messages", { messages: texts });
      } catch (err) {
        // The trick ends anyway: what is lost here is the message,
        // and that is precisely what needs to be said.
        console.error("[agent-vm] steering requeue failed:", (err as Error).message);
      }
    },

    hasPendingMessages: async () => {
      try {
        const body = (await request("GET", "/messages/pending")) as { pending?: unknown };
        return body.pending === true;
      } catch (err) {
        // Same rule as the two neighbors: a temporary breakdown must not
        // break an expectation, only let it come to an end.
        console.error("[agent-vm] pending steering read failed:", (err as Error).message);
        return false;
      }
    },

    checkInterrupt: async () => {
      try {
        const body = (await request("GET", "/interrupt")) as { interrupted?: unknown };
        return body.interrupted === true;
      } catch (err) {
        console.error("[agent-vm] interrupt read failed:", (err as Error).message);
        return false;
      }
    },

    /**
     * RISE if it fails, unlike its neighbors — and this is the exception that
     * confirms their rule. Not knowing how to read a line can wait for the round
     * following ; believing that you have erased a flag that remained raised brings out the
     * turn to the next round, message accepted and never played. The loop therefore processes
     * failure as “always interrupted” (she rereads the flag behind).
     */
    clearInterrupt: async () => {
      await request("DELETE", "/interrupt");
    },

    budgetRemaining: async () => {
      try {
        const body = (await request("GET", "/budget")) as { remainingUsd?: unknown };
        return typeof body.remainingUsd === "number" && Number.isFinite(body.remainingUsd)
          ? body.remainingUsd
          : null;
      } catch (err) {
        // `null` and not 0: unreachable billing should not stop a
        // round in progress. This is the worst case assumed — we keep the entry ceiling,
        // which is that of the old form.
        console.error("[agent-vm] budget read failed:", (err as Error).message);
        return null;
      }
    },

    syncPlan: (steps) => postQuiet("/plan-sync", { steps }),

    callTool: async (name, body) => {
      const res = (await request("POST", `/tool/${name}`, body)) as VmToolResponse;
      return res;
    },

    repoAuthUrl: async () => {
      try {
        const body = (await request("POST", "/repo-auth")) as { authUrl?: unknown };
        return typeof body.authUrl === "string" && body.authUrl ? body.authUrl : null;
      } catch (err) {
        // The job already has a safe remote. A failed infrastructure refresh is
        // reported by the eventual Git push, while the credential stays hidden.
        console.error("[agent-vm] repo auth refresh failed:", (err as Error).message);
        return null;
      }
    },

    llmKey: async () => {
      const body = (await request("POST", "/llm-key")) as { key?: unknown };
      // `null` is the explicit contract of a local endpoint without auth. All
      // other hollow form remains a fault of the control plan: confusing the
      // two would hide a lost cloud key behind a 401 from the provider.
      if (body.key === null) return null;
      if (typeof body.key !== "string" || !body.key.trim()) {
        throw new Error("POST /llm-key returned no key");
      }
      return body.key;
    },

    reportTurn: async (report) => {
      await request("POST", "/rest", report);
    },
  };
}
