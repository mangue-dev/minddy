import type { McpAgentId } from "@/lib/mcp-agents";

/**
 * How a prompt leaves minddy for the user's own coding agent (MIN-951).
 *
 * An account that connected an agent to minddy's MCP gets SHORT prompts: they
 * name the record and let the agent read it, and its procedure, through the
 * MCP. The same account can also have prompts opened straight in the agent's
 * desktop app through its documented deep link, instead of pasting them.
 *
 * Pure and server-safe: the React side lives in `prompt-delivery-context`.
 */

/** The desktop apps a prompt can be opened in. */
export type AgentTarget = "claude" | "codex" | "cursor";

interface AgentTargetSpec {
  label: string;
  /** The registry agent whose logo stands for the app. */
  logo: McpAgentId;
  link: (prompt: string) => string;
  /** Longest prompt the app keeps whole, in characters. */
  promptLimit?: number;
  /** Longest whole link the app accepts, once encoded. */
  urlLimit?: number;
}

// Every value goes through encodeURIComponent, never URLSearchParams: a space
// must travel as %20, since Cursor keeps a literal "+".
const param = (name: string, value: string) => `${name}=${encodeURIComponent(value)}`;

export const AGENT_TARGETS: Record<AgentTarget, AgentTargetSpec> = {
  claude: {
    label: "Claude Code",
    logo: "claude",
    link: (prompt) => `claude://code/new?${param("q", prompt)}`,
    // Claude Desktop truncates a linked prompt around 14,000 characters.
    promptLimit: 14_000,
  },
  codex: {
    label: "Codex",
    logo: "codex",
    link: (prompt) => `codex://new?${param("prompt", prompt)}`,
    // Codex documents no limit; Claude's is reused until one is measured.
    promptLimit: 14_000,
  },
  cursor: {
    label: "Cursor",
    logo: "cursor",
    link: (prompt) => `cursor://anysphere.cursor-deeplink/prompt?${param("text", prompt)}`,
    // Cursor documents 8,000 characters for the whole link.
    urlLimit: 8_000,
  },
};

export const AGENT_TARGET_IDS = Object.keys(AGENT_TARGETS) as AgentTarget[];

/** The app an MCP client opens prompts in, when it has a working deep link. */
export function agentTargetOf(agent: string | null | undefined): AgentTarget | null {
  if (agent === "claude" || agent === "claude-desktop") return "claude";
  if (agent === "codex" || agent === "cursor") return agent;
  return null;
}

/** The apps the account's MCP connections can open, in registry order. */
export function connectedAgentTargets(
  agents: ReadonlyArray<string | null | undefined>,
): AgentTarget[] {
  const connected = new Set(agents.map(agentTargetOf));
  return AGENT_TARGET_IDS.filter((target) => connected.has(target));
}

/**
 * The link that opens `prompt` in the target app, or null when the app would
 * truncate or refuse it: the caller then copies instead.
 */
export function buildAgentDeepLink(target: AgentTarget, prompt: string): string | null {
  const spec = AGENT_TARGETS[target];
  if (!prompt) return null;
  if (spec.promptLimit !== undefined && prompt.length > spec.promptLimit) return null;
  const link = spec.link(prompt);
  if (spec.urlLimit !== undefined && link.length > spec.urlLimit) return null;
  return link;
}

// Account preferences, in the auth `user_metadata` like `prompt_copy_auto_start`.
export const PROMPT_SEND_META_KEY = "prompt_send_to_agent";
export const PROMPT_SEND_AGENT_META_KEY = "prompt_send_agent";

type Metadata = Record<string, unknown> | null | undefined;

/** Whether prompts open in the agent's app. Off unless explicitly turned on. */
export function resolvePromptSend(meta: Metadata): boolean {
  return meta?.[PROMPT_SEND_META_KEY] === true;
}

/** The app the account chose, if it names a known one. */
export function resolvePromptSendAgent(meta: Metadata): AgentTarget | null {
  const value = meta?.[PROMPT_SEND_AGENT_META_KEY];
  return AGENT_TARGET_IDS.find((target) => target === value) ?? null;
}

export interface PromptDelivery {
  /** A connected MCP agent can read the record: prompts only name it. */
  short: boolean;
  /** The app prompts open in; null copies them. */
  target: AgentTarget | null;
}

export const COPY_LONG_PROMPTS: PromptDelivery = { short: false, target: null };

/**
 * What the account's prompts do. Any active MCP connection makes them short.
 * They open in an app only on a desktop viewport, when the account asked for
 * it and still has a connection to that app; a chosen app whose connection
 * was revoked falls back to the first one still connected.
 */
export function resolvePromptDelivery({
  meta,
  agents,
  mobile,
}: {
  meta: Metadata;
  /** The registry agent of each active MCP connection; null = unknown client. */
  agents: ReadonlyArray<string | null | undefined>;
  mobile: boolean;
}): PromptDelivery {
  if (agents.length === 0) return COPY_LONG_PROMPTS;
  if (mobile || !resolvePromptSend(meta)) return { short: true, target: null };
  const targets = connectedAgentTargets(agents);
  const chosen = resolvePromptSendAgent(meta);
  return {
    short: true,
    target: chosen && targets.includes(chosen) ? chosen : (targets[0] ?? null),
  };
}
