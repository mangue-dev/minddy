/**
 * Le mode d'emploi que le serveur MCP renvoie à son client, à l'initialisation.
 *
 * Sorti de `app/api/mcp/route.ts` (MIN-88) parce qu'il sert maintenant deux
 * fois : au handshake MCP, et dans `/llms.txt` — le fichier que lisent les
 * assistants de code quand on leur demande de brancher minddy. Deux copies
 * auraient divergé au premier ajout d'outil, et un `llms.txt` qui décrit une
 * API périmée est pire que pas de `llms.txt` du tout.
 */
export const MCP_SERVER_INSTRUCTIONS =
"minddy is a minimal issue tracker (Linear-like). Hierarchy: a project is the " +
      "workspace; issues belong to a project; an objective groups issues of a project " +
      "around a goal. Issue identifiers read '<PROJECT KEY>-<number>' (e.g. MIND-42): " +
      "tools accept them wherever an 'issue' parameter appears. Statuses: triage, " +
      "backlog, todo, in_progress, in_review, done, canceled, duplicate. Priorities: " +
      "none, urgent, high, medium, low. Efforts (t-shirt): xs, s, m, l, xl. An issue " +
      "can carry an implementation plan (field 'plan'): a REAL engineering plan in " +
      "markdown, like your plan mode output, with a short context (goal, approach), " +
      "ordered checkbox tasks naming the actual code to touch (exact file paths, " +
      "components, functions, migrations), and a verification step. Checkbox lines are " +
      "trackable tasks: '- [ ]' pending, '- [~]' in progress, '- [x]' completed, " +
      "'- [-]' cancelled, except under a '## Questions' heading, where they are open " +
      "questions rather than work and never count towards progress (park one there only " +
      "when a detail is blocking; otherwise decide and state the assumption). " +
      "When asked to plan work, write the full plan into the issue " +
      "(create/update); while executing one, keep task states current with " +
      "minddy_update_plan_task (mark the task you start '- [~]', finished '- [x]'). " +
      "Issues, objectives and comments can carry file attachments: minddy_get_issue " +
      "and minddy_list_objectives list their metadata (id + name/type/size), " +
      "minddy_add_attachment uploads one (base64, 10 MB max) to an issue or, via " +
      "comment_id, to a comment, and minddy_get_attachment downloads one by id " +
      "(signed URL, or the bytes inline). An issue worked by minddy's code agent " +
      "carries a PULL REQUEST: minddy_get_pull_request reads it from the issue: " +
      "state, branches, description and per-file diffs. " +
      "The key owner may have a " +
      "CYCLE: their personal, cross-project week/fortnight ('what am I working on " +
      "right now'). minddy_get_cycle reads it, minddy_fill_cycle tops it up with the " +
      "deterministic engine, minddy_add_to_cycle / minddy_remove_from_cycle move " +
      "individual issues; adding assigns the issue to the owner and never changes " +
      "its status. " +
      "The key owner also has a SCRATCHPAD: one personal, cross-project notes doc of " +
      "quick things to do right now (the in-app replacement for a problems.md), in the " +
      "same checkbox markdown as plans. minddy_get_scratchpad reads it (tasks listed with " +
      "0-based indices); minddy_add_scratchpad_tasks appends new tasks (optionally under a " +
      "'##' section); minddy_update_scratchpad_task flips individual tasks' states by index " +
      "the precise way to tick items off; minddy_set_scratchpad replaces the WHOLE doc " +
      "(for editing task text or restructuring), so read first and preserve what you are not " +
      "changing. " +
      "A project can also collect user requests on a FEEDBACK board (also fed by its " +
      "API and internal entry), separate from issues: a user need with a public " +
      "status and votes. minddy_list_feedback / minddy_get_feedback read them (the " +
      "latter includes the internal, team-only comment thread); minddy_promote_feedback " +
      "turns one into a new linked issue and minddy_link_feedback / " +
      "minddy_unlink_feedback wire it to an existing one (once linked, the post's " +
      "public status follows the issue); minddy_add_feedback_comment leaves an " +
      "internal note; minddy_respond_feedback publishes the team's PUBLIC reply. " +
      "Start with minddy_list_projects to discover project ids.";
