/**
 * Registry of AI agents that can connect to minddy's MCP server (account
 * settings → MCP). OAuth 2.1 only: installation commands contain no secrets.
 * The client discovers the OAuth flow from the well-known metadata and opens
 * the browser for consent on first use. This module is imported client-side to
 * build commands and server-side to map client_name to an attributed agent.
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
  build: (endpoint: string) => string;
}

export const MCP_AGENTS: McpAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "command",
    hint: "mcpHintCommand",
    // --scope user: without it, the server is registered in LOCAL scope (linked
    // to the folder where the command was launched) and does not appear in
    // the VS Code extension nor in the desktop app opened elsewhere.
    // Authentication then continues through /mcp in the browser.
    build: (endpoint) =>
      `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    kind: "url",
    hint: "mcpHintConnector",
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
    // Native HTTP streamable server + dedicated OAuth login.
    build: (endpoint) =>
      `codex mcp add ${MCP_SERVER_NAME} --url ${endpoint} && codex mcp login ${MCP_SERVER_NAME}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "config",
    hint: "mcpHintCursor",
    // Block to paste in ~/.cursor/mcp.json. Cursor handles OAuth natively
    // (“Needs login” button on the server) and reloads the file hot.
    //
    // Do not use `cursor://anysphere.cursor-deeplink/mcp/install` or
    // `cursor --add-mcp`; both were non-functional in Cursor 3.14.7. The deep
    // link reaches `aiSettings.action.open("mcp")` and `mcp.deeplinkInstall`, but
    // the “Tools & MCPs” tab has been hidden since the “Customize” migration.
    // Cursor falls back to General settings, where the confirmation card never
    // appears. The inherited VS Code command writes `mcp.servers` in
    // settings.json, which Cursor's MCP implementation does not read, despite
    // reporting “Added MCP servers”.
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
    // --scope user: the default (project) links the server to the current folder.
    // OAuth authentication then continues through /mcp auth.
    build: (endpoint) =>
      `gemini mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "command",
    hint: "mcpHintCommand",
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
