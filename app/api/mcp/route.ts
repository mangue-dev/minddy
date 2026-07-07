import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMinddyTools } from "@/lib/server/mcp/tools";
import { verifyMcpToken } from "@/lib/server/mcp/auth";

/**
 * Serveur MCP de minddy — Streamable HTTP stateless (un McpServer neuf par
 * POST, pas de sessions ni de notifications serveur : profil « tools-only »,
 * adapté au serverless). Auth par clé API personnelle (Bearer mdyk_…,
 * settings du compte) ; l'agent agit comme le propriétaire de la clé.
 *
 *   claude mcp add --transport http minddy <url>/api/mcp \
 *     --header "Authorization: Bearer mdyk_…"
 */

const handler = createMcpHandler(
  (server) => registerMinddyTools(server),
  {
    serverInfo: { name: "minddy", version: "1.0.0" },
    instructions:
      "minddy is a minimal issue tracker (Linear-like). Hierarchy: a project is the " +
      "workspace; issues belong to a project; an objective groups issues of a project " +
      "around a goal. Issue identifiers read '<PROJECT KEY>-<number>' (e.g. MIND-42) — " +
      "tools accept them wherever an 'issue' parameter appears. Statuses: triage, " +
      "backlog, todo, in_progress, in_review, done, canceled, duplicate. Priorities: " +
      "none, urgent, high, medium, low. Efforts (t-shirt): xs, s, m, l, xl. An issue " +
      "can carry an implementation plan (field 'plan'): a REAL engineering plan in " +
      "markdown — like your plan mode output — with a short context (goal, approach), " +
      "ordered checkbox tasks naming the actual code to touch (exact file paths, " +
      "components, functions, migrations), and a verification step. Checkbox lines are " +
      "trackable tasks — '- [ ]' pending, '- [~]' in progress, '- [x]' completed, " +
      "'- [-]' cancelled. When asked to plan work, write the full plan into the issue " +
      "(create/update); while executing one, keep task states current with " +
      "minddy_update_plan_task (mark the task you start '- [~]', finished '- [x]'). " +
      "Start with minddy_list_projects to discover project ids.",
  },
  { basePath: "/api", disableSse: true, maxDuration: 60 }
);

const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
export const maxDuration = 60;
