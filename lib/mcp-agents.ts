/**
 * Registry des agents IA connectables au serveur MCP de minddy (settings du
 * compte → Clés API). Chaque agent définit comment produire son artefact
 * d'installation clé en main — commande shell à coller, bloc de config, ou
 * deeplink — avec la clé API embarquée. Importable côté client (build des
 * commandes) et côté serveur (validation de l'id).
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
  build: (endpoint: string, key: string) => string;
}

const bearer = (key: string) => `Bearer ${key}`;

export const MCP_AGENTS: McpAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "command",
    logo: "/agents/claude.svg",
    // --scope user : sans lui, le serveur est enregistré en scope LOCAL (lié
    // au dossier où la commande a été lancée) et n'apparaît ni dans
    // l'extension VS Code ni dans l'app desktop ouvertes ailleurs.
    build: (endpoint, key) =>
      `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint} --header "Authorization: ${bearer(key)}"`,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "command",
    logo: "/agents/codex-light.svg",
    logoDark: "/agents/codex-dark.svg",
    // Pas de header littéral dans `codex mcp add` (env var uniquement) — on
    // écrit le bloc [mcp_servers.*] avec http_headers, supporté par config.toml.
    build: (endpoint, key) =>
      `printf '\\n[mcp_servers.${MCP_SERVER_NAME}]\\nurl = "${endpoint}"\\nhttp_headers = { "Authorization" = "${bearer(key)}" }\\n' >> ~/.codex/config.toml`,
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "deeplink",
    logo: "/agents/cursor-light.svg",
    logoDark: "/agents/cursor-dark.svg",
    build: (endpoint, key) => {
      const config = JSON.stringify({
        url: endpoint,
        headers: { Authorization: bearer(key) },
      });
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${btoa(config)}`;
    },
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "command",
    logo: "/agents/gemini.svg",
    // --scope user : même logique que Claude Code — le défaut (project) lie
    // le serveur au dossier courant au lieu du compte.
    build: (endpoint, key) =>
      `gemini mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint} --header "Authorization: ${bearer(key)}"`,
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "command",
    logo: "/agents/vscode.svg",
    build: (endpoint, key) =>
      `code --add-mcp '${JSON.stringify({
        name: MCP_SERVER_NAME,
        type: "http",
        url: endpoint,
        headers: { Authorization: bearer(key) },
      })}'`,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    kind: "config",
    logo: "/agents/windsurf-light.svg",
    logoDark: "/agents/windsurf-dark.svg",
    // Pas de CLI — bloc à coller dans ~/.codeium/windsurf/mcp_config.json.
    build: (endpoint, key) =>
      JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              serverUrl: endpoint,
              headers: { Authorization: bearer(key) },
            },
          },
        },
        null,
        2
      ),
  },
];

export const isMcpAgentId = (v: unknown): v is McpAgentId =>
  typeof v === "string" && MCP_AGENTS.some((a) => a.id === v);

export const getMcpAgent = (id: McpAgentId): McpAgent =>
  MCP_AGENTS.find((a) => a.id === id) as McpAgent;
