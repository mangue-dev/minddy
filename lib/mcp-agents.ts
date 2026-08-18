/**
 * Registry of AI agents connectable to minddy's MCP server (settings du
 * account → MCP). Auth OAuth 2.1 only: The install commands contain NO secrets — the client discovers the OAuth flow via the well-known metadata and opens the browser for consent for the first use. Importable on the client side (build orders) and on the
 * server side (mapping client_name → agent for logos/attribution).
 */

import type { MessageKey } from "@/lib/i18n-keys";

export const MCP_SERVER_NAME = "minddy";

export type McpAgentId =
  | "claude"
  | "claude-desktop"
  | "codex"
  | "cursor"
  | "gemini"
  | "vscode"
  | "windsurf";

export interface McpAgent {
  id: McpAgentId;
  label: string;
  /** How the build() artifact is used:
 command → paste into a terminal
 config → paste into a configuration file
 url → paste the server URL into “Add a connector” */
  kind: "command" | "config" | "url";
  /** The exact gesture, agent by agent (file path, menu to open):
 two agents with the same `kind` are not configured in the same place. */
  hint: MessageKey<"Account">;
  /** Logo for light theme (public/); logoDark = dark theme variant. */
  logo: string;
  logoDark?: string;
  build: (endpoint: string) => string;
}

export const MCP_AGENTS: McpAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "command",
    hint: "mcpHintCommand",
    logo: "/agents/claude.svg",
    // --scope user: without it, the server is registered in LOCAL scope (linked
    // to the folder where the command was launched) and does not appear in
    // the VS Code extension nor in the desktop app opened elsewhere.
    // L'authentification se fait ensuite via /mcp (navigateur).
    build: (endpoint) =>
      `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    kind: "url",
    hint: "mcpHintConnector",
    logo: "/agents/claude.svg",
    // Claude Desktop and claude.ai do NOT read Claude Code's config: the
    // remote server is added as a “custom connector” (Settings →
    // Connectors → Add connector), by pasting the URL — the OAuth is
    // managed natively on first use.
    build: (endpoint) => endpoint,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "command",
    hint: "mcpHintCommand",
    logo: "/agents/codex-light.svg",
    logoDark: "/agents/codex-dark.svg",
    // Native HTTP streamable server + dedicated OAuth login.
    build: (endpoint) =>
      `codex mcp add ${MCP_SERVER_NAME} --url ${endpoint} && codex mcp login ${MCP_SERVER_NAME}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "config",
    hint: "mcpHintCursor",
    logo: "/agents/cursor-light.svg",
    logoDark: "/agents/cursor-dark.svg",
    // Block to paste in ~/.cursor/mcp.json. Cursor handles OAuth natively
    // (“Needs login” button on the server) and reloads the file hot.
    //
    // NO deeplink `cursor://anysphere.cursor-deeplink/mcp/install`, and no
    // from `cursor --add-mcp`: both are dead, checked on Cursor 3.14.7.
    // The deeplink is well received, but its handler is
    // `aiSettings.action.open("mcp")` puis `mcp.deeplinkInstall` — or l'onglet
    // “Tools & MCPs” is hidden since the “Customize” migration, so
    // Cursor falls back to the *General* settings and the confirmation card
    // (the only place where the proposed installation is accepted) does not exist
    // leaves. This is exactly the symptom observed: it opens the settings, and
    // Nothing. `cursor --add-mcp` is even worse: inherited from VS Code, it writes
    // in `mcp.servers` of settings.json, which Cursor MCP does not read —
    // it announces “Added MCP servers” without having installed anything.
    build: (endpoint) =>
      JSON.stringify(
        { mcpServers: { [MCP_SERVER_NAME]: { url: endpoint } } },
        null,
        2
      ),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "command",
    hint: "mcpHintCommand",
    logo: "/agents/gemini.svg",
    // --scope user: the default (project) links the server to the current folder.
    // L'authentification OAuth se fait via /mcp auth.
    build: (endpoint) =>
      `gemini mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "command",
    hint: "mcpHintCommand",
    logo: "/agents/vscode.svg",
    build: (endpoint) =>
      `code --add-mcp '${JSON.stringify({
        name: MCP_SERVER_NAME,
        type: "http",
        url: endpoint,
      })}'`,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    kind: "config",
    hint: "mcpHintWindsurf",
    logo: "/agents/windsurf-light.svg",
    logoDark: "/agents/windsurf-dark.svg",
    // No CLI — block to paste in ~/.codeium/windsurf/mcp_config.json.
    build: (endpoint) =>
      JSON.stringify(
        { mcpServers: { [MCP_SERVER_NAME]: { serverUrl: endpoint } } },
        null,
        2
      ),
  },
];

export const isMcpAgentId = (v: unknown): v is McpAgentId =>
  typeof v === "string" && MCP_AGENTS.some((a) => a.id === v);

export const getMcpAgent = (id: McpAgentId): McpAgent =>
  MCP_AGENTS.find((a) => a.id === id) as McpAgent;

/**
 * Displayed name of an action passed by the MCP server: the canonical wording of
 * the agent (Claude Code, Cursor…) when the key is attached to a known agent,
 * otherwise the raw name of the key, stripped of the final “(…)” that clients y
 * hang (current folder/project). No suffix "(mcp)": the logo of
 * the agent already says where the action comes from.
 *
 * `fallback` is the translation of the case "unnamed key", provided by the caller
 * (client side, `Timeline.mcpFallback`).
 */
export function mcpActorLabel(
  agent: string | null | undefined,
  keyName: string | null | undefined,
  fallback: string
): string {
  if (isMcpAgentId(agent)) return getMcpAgent(agent).label;
  const raw = (keyName ?? fallback).trim();
  return raw.replace(/\s*\([^()]*\)\s*$/, "").trim() || raw;
}

/** Guess the agent behind an OAuth client_name (DCR) to reuse the
 logos/registry attribution — null if unknown (generic icon). */
export function mapClientNameToAgent(name: string): McpAgentId | null {
  const n = name.toLowerCase();
  if (n.includes("claude")) return "claude";
  if (n.includes("cursor")) return "cursor";
  if (n.includes("codex") || n.includes("chatgpt") || n.includes("openai"))
    return "codex";
  if (n.includes("gemini")) return "gemini";
  if (n.includes("visual studio") || n.includes("vs code") || n.includes("vscode"))
    return "vscode";
  if (n.includes("windsurf")) return "windsurf";
  return null;
}
