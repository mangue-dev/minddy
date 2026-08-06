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
      "can RECUR: field 'recurrence' (daily, weekly, monthly, yearly) riding on its " +
      "due date — 'every Monday' is the cadence plus the date, so a cadence without " +
      "a due_date is refused. Completing a recurring issue creates the next " +
      "occurrence itself, in backlog, one cadence later: only ever ONE live issue " +
      "per series, never create the next one by hand. An issue " +
      "can carry an implementation plan (field 'plan'): a REAL engineering plan in " +
      "markdown, like your plan mode output, with a short context (goal, approach), " +
      "ordered checkbox tasks naming the actual code to touch (exact file paths, " +
      "components, functions, migrations), and a verification step. Checkbox lines are " +
      "trackable tasks: '- [ ]' pending, '- [~]' in progress, '- [x]' completed, " +
      "'- [-]' cancelled, except under a '## Questions' heading, where they are open " +
      "questions rather than work and never count towards progress (park one there only " +
      "when a detail is blocking; otherwise decide and state the assumption). " +
      "When asked to plan work, write the full plan into the issue " +
      "(create/update). AFTERWARDS, never resend the document to change part of " +
      "it: minddy_update_plan_task flips task states (mark the task you start " +
      "'- [~]', finished '- [x]'), minddy_append_to_plan adds a block (a task, a " +
      "note), and minddy_edit_issue_text rewrites one passage of the plan — or of " +
      "the description — in place (old_string → new_string, unique match, like a " +
      "code editor). Each costs a few tokens instead of the whole plan, and a " +
      "stale old_string fails loudly where a full rewrite would silently overwrite " +
      "someone else's edit. " +
      "Issues, objectives and comments can carry file attachments: minddy_get_issue " +
      "and minddy_list_objectives list their metadata (id + name/type/size), " +
      "minddy_add_attachment uploads one (base64, 10 MB max) to an issue or, via " +
      "comment_id, to a comment, and minddy_get_attachment downloads one by id " +
      "(signed URL, or the bytes inline). An issue worked by minddy's code agent " +
      "carries a PULL REQUEST: minddy_get_pull_request reads it from the issue: " +
      "state, branches, description and per-file diffs. A pull request of a linked " +
      "repository normally finds its issue by CONVENTION (the identifier in the branch, " +
      "the title, or a 'Fixes KEY-42' line); when it followed none of them and stayed " +
      "unattached, minddy_link_pull_request attaches it after the fact, by PR number or " +
      "URL, and aligns the issue's status on the state of the PR. That link is " +
      "definitive — there is no unlink. " +
      "The key owner may have a " +
      "CYCLE: their personal, cross-project week/fortnight ('what am I working on " +
      "right now'). minddy_get_cycle reads it, minddy_fill_cycle tops it up with the " +
      "deterministic engine, minddy_add_to_cycle / minddy_remove_from_cycle move " +
      "individual issues; adding assigns the issue to the owner and never changes " +
      "its status. An issue in triage is never in a cycle: it can't be added to " +
      "one, and moving a cycled issue back to triage takes it out. " +
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
      "latter includes the WHOLE comment thread — team-only notes and the public " +
      "replies visitors wrote on the board alike, each tagged by its 'visibility' — " +
      "plus the translation of a request written in a language the team does not " +
      "read); minddy_promote_feedback " +
      "turns one into a new linked issue and minddy_link_feedback / " +
      "minddy_unlink_feedback wire it to an existing one (once linked, the post's " +
      "public status follows the issue, and can no longer be set by hand); " +
      "minddy_update_feedback decides on a post that is NOT linked — status " +
      "(open, planned, in_progress, shipped, declined, spam), visibility, " +
      "publication; minddy_add_feedback_comment leaves an " +
      "internal note; minddy_respond_feedback publishes the team's PUBLIC reply. " +
      "You can also WIRE THE USER'S OWN APPLICATION to minddy from their repo, " +
      "which is something only you can do — minddy's in-app assistant has no access " +
      "to their code. minddy_get_feedback_board reads the public board's setup: take " +
      "its public_url verbatim for any 'Feedback' link or button (it already " +
      "resolves the project's custom domain, and a board URL is an opaque token that " +
      "cannot be guessed), and minddy_configure_feedback_board publishes the board, " +
      "opens or closes its public comments, or hands you its SSO secret. " +
      "minddy_create_integration creates the API key an " +
      "application uses to push server-to-server — kind 'feedback' to submit " +
      "end-user requests to the board, kind 'issues' to create issues in triage — " +
      "and returns, ONCE, the plaintext key plus a `usage` object with the exact " +
      "endpoints, payloads and error codes: write the key into the project's " +
      "server-side environment (never client-side, never committed) and implement " +
      "against that `usage`, not from memory. An 'issues' integration also runs " +
      "the OTHER WAY: minddy_configure_webhook points it at an endpoint of their " +
      "app, and " +
      "minddy POSTs signed JSON there when issues are created, change status or " +
      "change fields — that is how the app learns a human triaged what it pushed, " +
      "so never write a polling loop. The `usage.webhook` of the created key, and " +
      "the result of minddy_configure_webhook, carry the receiver contract: " +
      "headers, HMAC verification, payload, delivery guarantees. " +
      "minddy_list_integrations shows what already exists (never a key, but the " +
      "webhook setup and its last delivery status), minddy_revoke_integration " +
      "kills one for good. " +
      "Start with minddy_list_projects to discover project ids.";
