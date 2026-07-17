import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMinddyTools } from "@/lib/server/mcp/tools";
import { verifyMcpToken } from "@/lib/server/mcp/auth";

/**
 * Serveur MCP de minddy — Streamable HTTP stateless (un McpServer neuf par
 * POST, pas de sessions ni de notifications serveur : profil « tools-only »,
 * adapté au serverless). Auth OAuth 2.1 uniquement : le 401 renvoie le
 * resource_metadata, le client découvre l'AS (well-known) et ouvre le
 * navigateur pour le consentement — l'agent agit comme l'utilisateur qui a
 * autorisé.
 *
 *   claude mcp add --scope user --transport http minddy <url>/api/mcp
 *   (puis /mcp dans Claude Code pour s'authentifier)
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
      "Issues, objectives and comments can carry file attachments: minddy_get_issue " +
      "and minddy_list_objectives list their metadata (id + name/type/size), " +
      "minddy_add_attachment uploads one (base64, 10 MB max) to an issue or, via " +
      "comment_id, to a comment, and minddy_get_attachment downloads one by id " +
      "(signed URL, or the bytes inline). An issue worked by minddy's code agent " +
      "carries a PULL REQUEST: minddy_get_pull_request reads it from the issue — " +
      "state, branches, description and per-file diffs. " +
      "The key owner may have a " +
      "CYCLE: their personal, cross-project week/fortnight ('what am I working on " +
      "right now'). minddy_get_cycle reads it, minddy_fill_cycle tops it up with the " +
      "deterministic engine, minddy_add_to_cycle / minddy_remove_from_cycle move " +
      "individual issues — adding assigns the issue to the owner and never changes " +
      "its status. " +
      "A project can also collect user requests on a FEEDBACK board (also fed by its " +
      "API and internal entry) — separate from issues: a user need with a public " +
      "status and votes. minddy_list_feedback / minddy_get_feedback read them (the " +
      "latter includes the internal, team-only comment thread); minddy_promote_feedback " +
      "turns one into a new linked issue and minddy_link_feedback / " +
      "minddy_unlink_feedback wire it to an existing one (once linked, the post's " +
      "public status follows the issue); minddy_add_feedback_comment leaves an " +
      "internal note; minddy_respond_feedback publishes the team's PUBLIC reply. " +
      "Start with minddy_list_projects to discover project ids.",
  },
  { basePath: "/api", disableSse: true, maxDuration: 60 }
);

const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
export const maxDuration = 60;
