/**
 * Registry des agents IA connectables au serveur MCP de minddy (settings du
 * compte → MCP). Auth OAuth 2.1 uniquement : les commandes d'installation ne
 * contiennent AUCUN secret — le client découvre le flux OAuth via les
 * metadata well-known et ouvre le navigateur pour le consentement à la
 * première utilisation. Importable côté client (build des commandes) et côté
 * serveur (mapping client_name → agent pour les logos/attribution).
 */

export const MCP_SERVER_NAME = "minddy";

export type McpAgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "gemini"
  | "vscode"
  | "windsurf";

export interface McpAgent {
  id: McpAgentId;
  label: string;
  /** Comment l'artefact de build() s'utilise :
      command  → coller dans un terminal
      config   → coller dans un fichier de configuration
      deeplink → URL ouverte directement (installation en un clic) */
  kind: "command" | "config" | "deeplink";
  /** Logo pour thème clair (public/) ; logoDark = variante thème sombre. */
  logo: string;
  logoDark?: string;
  build: (endpoint: string) => string;
}

export const MCP_AGENTS: McpAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "command",
    logo: "/agents/claude.svg",
    // --scope user : sans lui, le serveur est enregistré en scope LOCAL (lié
    // au dossier où la commande a été lancée) et n'apparaît ni dans
    // l'extension VS Code ni dans l'app desktop ouvertes ailleurs.
    // L'authentification se fait ensuite via /mcp (navigateur).
    build: (endpoint) =>
      `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "command",
    logo: "/agents/codex-light.svg",
    logoDark: "/agents/codex-dark.svg",
    // Serveur streamable HTTP natif + login OAuth dédié.
    build: (endpoint) =>
      `codex mcp add ${MCP_SERVER_NAME} --url ${endpoint} && codex mcp login ${MCP_SERVER_NAME}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "deeplink",
    logo: "/agents/cursor-light.svg",
    logoDark: "/agents/cursor-dark.svg",
    // Cursor gère l'OAuth nativement (bouton « Needs login » sur le serveur).
    build: (endpoint) => {
      const config = JSON.stringify({ url: endpoint });
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${btoa(config)}`;
    },
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "command",
    logo: "/agents/gemini.svg",
    // --scope user : le défaut (project) lie le serveur au dossier courant.
    // L'authentification OAuth se fait via /mcp auth.
    build: (endpoint) =>
      `gemini mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`,
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "command",
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
    logo: "/agents/windsurf-light.svg",
    logoDark: "/agents/windsurf-dark.svg",
    // Pas de CLI — bloc à coller dans ~/.codeium/windsurf/mcp_config.json.
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

/** Devine l'agent derrière un client_name OAuth (DCR) pour réutiliser les
    logos/attribution du registry — null si inconnu (icône générique). */
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
