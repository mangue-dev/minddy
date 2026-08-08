/**
 * Registry des agents IA connectables au serveur MCP de minddy (settings du
 * compte → MCP). Auth OAuth 2.1 uniquement : les commandes d'installation ne
 * contiennent AUCUN secret — le client découvre le flux OAuth via les
 * metadata well-known et ouvre le navigateur pour le consentement à la
 * première utilisation. Importable côté client (build des commandes) et côté
 * serveur (mapping client_name → agent pour les logos/attribution).
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
  /** Comment l'artefact de build() s'utilise :
      command  → coller dans un terminal
      config   → coller dans un fichier de configuration
      url      → coller l'URL du serveur dans « Ajouter un connecteur » */
  kind: "command" | "config" | "url";
  /** Le geste exact, agent par agent (chemin du fichier, menu à ouvrir) :
      deux agents de même `kind` ne se configurent pas au même endroit. */
  hint: MessageKey<"Account">;
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
    hint: "mcpHintCommand",
    logo: "/agents/claude.svg",
    // --scope user : sans lui, le serveur est enregistré en scope LOCAL (lié
    // au dossier où la commande a été lancée) et n'apparaît ni dans
    // l'extension VS Code ni dans l'app desktop ouvertes ailleurs.
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
    // Claude Desktop et claude.ai ne lisent PAS la config de Claude Code : le
    // serveur distant s'ajoute comme « connecteur personnalisé » (Réglages →
    // Connecteurs → Ajouter un connecteur), en collant l'URL — l'OAuth est
    // géré nativement au premier usage.
    build: (endpoint) => endpoint,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "command",
    hint: "mcpHintCommand",
    logo: "/agents/codex-light.svg",
    logoDark: "/agents/codex-dark.svg",
    // Serveur streamable HTTP natif + login OAuth dédié.
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
    // Bloc à coller dans ~/.cursor/mcp.json. Cursor gère l'OAuth nativement
    // (bouton « Needs login » sur le serveur) et recharge le fichier à chaud.
    //
    // PAS de deeplink `cursor://anysphere.cursor-deeplink/mcp/install`, et pas
    // de `cursor --add-mcp` : les deux sont morts, vérifié sur Cursor 3.14.7.
    // Le deeplink est bien reçu, mais son handler fait
    // `aiSettings.action.open("mcp")` puis `mcp.deeplinkInstall` — or l'onglet
    // « Tools & MCPs » est masqué depuis la migration « Customize », donc
    // Cursor retombe sur les réglages *General* et la carte de confirmation
    // (le seul endroit où l'installation proposée s'accepte) n'existe nulle
    // part. C'est exactement le symptôme observé : ça ouvre les paramètres, et
    // rien. `cursor --add-mcp` est pire encore : hérité de VS Code, il écrit
    // dans `mcp.servers` de settings.json, que le MCP de Cursor ne lit pas —
    // il annonce « Added MCP servers » sans rien avoir installé.
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
    // --scope user : le défaut (project) lie le serveur au dossier courant.
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

/**
 * Nom affiché d'une action passée par le serveur MCP : le libellé canonique de
 * l'agent (Claude Code, Cursor…) quand la clé est rattachée à un agent connu,
 * sinon le nom brut de la clé, débarrassé du « (…) » final que les clients y
 * accrochent (dossier/projet courant). Pas de suffixe « (mcp) » : le logo de
 * l'agent dit déjà d'où vient l'action.
 *
 * `fallback` est la traduction du cas « clé sans nom », fournie par l'appelant
 * (côté client, `Timeline.mcpFallback`).
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
