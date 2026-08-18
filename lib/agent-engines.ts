/**
 * WHICH HARNESS PLAYED A RUN (MIN-286).
 *
 * `opencode` — the headless server controlled by our supervisor
 * ([vm/supervisor.ts](server/agent/vm/supervisor.ts)) — is THE engine, and since
 * the removal of the house loop (2026-08-14) it is the ONLY one: no more flag,
 * no more switches, no more second path to maintain.
 *
 * `loop` remains in the type, and it is not nostalgia: hundreds of
 * lines of `agent_runs` carry it, and the column reads back — an incident from July
 * reads on the run line, not what's running today. What the value
 * no longer does is decide: no code uses it to choose a path.
 *
 * A conversation led by the loop, however, can no longer be resumed as
 * as it is: the two engines kept their memory in two different fields of the
 * checkpoint (`messages` on one side, `opencode` on the other), and the first one no longer has a reader. The function SAYS it on the next turn rather than keeping it quiet — cf.
 * `priorConversationLost` in [execute.ts](server/agent/execute.ts).
 *
 * The type lives HERE, outside of `server/`, for the same reason that `agent-providers.ts` :
 * it crosses the border of the microVM, and this file must not import any
 * module `server-only`.
 */

export const AGENT_ENGINES = ["loop", "opencode"] as const;

export type AgentEngine = (typeof AGENT_ENGINES)[number];

/**
 * Engines that can still PLAY a turn — as distinguished from `AGENT_ENGINES`,
 * which lists what a run line can carry. It is on this that
 * the execution guardrails count (see `redaction-invariant.test.ts`): a
 * motor added without its guard must cause the continuation to fall, a REMOVED motor must
 * not claim a guard which no longer has any code to protect.
 */
export const LIVE_AGENT_ENGINES = ["opencode"] as const satisfies readonly AgentEngine[];

export type LiveAgentEngine = (typeof LIVE_AGENT_ENGINES)[number];

/** The engine of any new run. */
export const AGENT_ENGINE: AgentEngine = "opencode";
