/**
 * Compact server metadata sent during MCP initialization.
 *
 * Tool selection belongs in each tool's description. Detailed workflow guidance stays
 * in `MCP_FULL_USAGE_GUIDE`, where clients can fetch it deliberately without making
 * every cold-start catalog repeat the same manual.
 */
export const MCP_DISCOVERY_INSTRUCTIONS =
  "minddy is a stateless issue tracker MCP. Start with minddy_list_projects to " +
  "discover project_id values, then choose a minddy_* tool by its action-specific " +
  "description. Issue references accept a UUID, an identifier such as MIND-42, or a " +
  "bare issue number. Read before writing; failures return stable error codes. The " +
  "complete usage guide is available at /llms-full.txt.";

/**
 * Complete operating guide rendered by `/llms-full.txt`.
 *
 * Keep this separate from initialization metadata: it is intentionally detailed and
 * remains the canonical workflow reference for agents that need more than discovery.
 */
export const MCP_FULL_USAGE_GUIDE =
"minddy is a minimal issue tracker (Linear-like). Hierarchy: a project is the " +
      "workspace; issues belong to a project; an objective groups issues of a project " +
      "around a goal — minddy_list_objectives lists them, minddy_get_objective " +
      "opens one (description, its issues, its comment thread), " +
      "minddy_create_objective / minddy_update_objective write it, and " +
      "minddy_add_objective_comment posts on the goal itself (a note about one " +
      "ticket goes on that ticket, with minddy_add_comment). " +
      "Issue identifiers read '<PROJECT KEY>-<number>' (e.g. MIND-42): " +
      "tools accept them wherever an 'issue' parameter appears. Statuses: triage, " +
      "backlog, todo, in_progress, in_review, done, canceled, duplicate. Priorities: " +
      "none, low, medium, high, urgent. Efforts (t-shirt): xs, s, m, l, xl. " +
      "FILL WHAT YOU CREATE. A ticket or an objective carrying only a title is " +
      "one a human has to finish by hand. On every issue you create: a " +
      "description (what and why), an estimated priority AND effort, the " +
      "project's matching categories (pass them BY NAME via category_names — no " +
      "lookup needed), the objective it belongs to, and an assignee when the " +
      "human named one, or the owner on a single-member project. " +
      "And its RELATIONS: an issue can block, be blocked_by, or be related to " +
      "another — minddy_get_issue reads them, minddy_link_issues writes one, and " +
      "minddy_create_issue takes them at creation, siblings of the same call " +
      "included ('sub:N'). A dependency you noticed and did not record is one " +
      "nobody else can see. minddy_list_members and minddy_list_categories " +
      "resolve names to ids when you need them. An issue " +
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
      "Issues, objectives and comments can carry RESOURCES — a file, a link, or " +
      "a PAGE of the project's wiki: " +
      "minddy_get_issue and minddy_list_objectives list them (id + kind, then " +
      "name/type/size for a file, url for a link, page_id + title for a page), " +
      "minddy_add_resource adds one " +
      "to an issue or, via comment_id, to a comment (a file inline as base64, " +
      "10 MB max, a url — minddy resolves its title and favicon itself —, or a " +
      "page_id from minddy_list_pages), " +
      "and minddy_get_resource reads one by id (a file's signed URL or its bytes " +
      "inline; a link's url and title; a page's id and title, whose document " +
      "minddy_get_page then reads). An issue worked by minddy's code agent " +
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
      "A project also has PAGES: its wiki, where the durable knowledge its issues " +
      "assume lives — specs, decisions and their why, conventions, runbooks. Read " +
      "them: a ticket says what to do, a page says why it is like that. " +
      "minddy_search_pages is the way IN when you have a subject rather than a " +
      "page — full text over titles AND bodies, with the passage that matched; " +
      "minddy_list_pages maps the wiki (ids, titles, icons, parents, no bodies), " +
      "minddy_get_page reads one in MARKDOWN with its direct subpages, " +
      "minddy_create_page writes a new one (optionally under a parent), and — as " +
      "for a plan, never resend the document to change part of it — " +
      "minddy_append_to_page adds a block at the end while " +
      "minddy_edit_page_text rewrites one passage in place (old_string → " +
      "new_string, unique match). minddy_update_page replaces a whole body, so " +
      "pass the version you read to be refused rather than overwrite someone. " +
      "A page is also DISCUSSED: minddy_get_page returns the threads on it — " +
      "objections and questions anchored to a passage — and " +
      "minddy_add_page_comment answers one, or raises one, without touching the " +
      "document. Prefer that to an edit when a passage looks wrong: a comment " +
      "asks whoever wrote it, an edit overwrites them. " +
      "Pages are markdown on both sides, never ProseMirror JSON, and they are how " +
      "'turn this page into tickets' works: read the page, then create the issues " +
      "with the issue tools. Pages are never deleted from here — the trash is a " +
      "human gesture. " +
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
      "the OTHER WAY: pointed at an endpoint of their app — a destination the " +
      "user sets themselves in Settings → Integrations, minddy_configure_webhook " +
      "only tuning what is already there — " +
      "minddy POSTs signed JSON there when issues are created, change status or " +
      "change fields — that is how the app learns a human triaged what it pushed, " +
      "so never write a polling loop. The `usage.webhook` of the created key, and " +
      "the result of minddy_configure_webhook, carry the receiver contract: " +
      "headers, HMAC verification, payload, delivery guarantees. " +
      "minddy_list_integrations shows what already exists (never a key, but the " +
      "webhook setup and its last delivery status), minddy_revoke_integration " +
      "kills one for good. " +
      "A project can also carry ROUTINES: jobs minddy's own coding agent runs BY " +
      "ITSELF on a cadence — a security review every Monday, a dependency sweep " +
      "on the 1st. minddy_create_routine schedules one (owner only), " +
      "minddy_list_routines shows what is already scheduled and when it last ran, " +
      "minddy_update_routine pauses or re-times one, minddy_delete_routine sends " +
      "it to the trash — it stops at once and keeps its history, restorable from " +
      "the app for a few weeks. A routine is neither a recurring issue nor a project " +
      "automation: nothing triggers it but the clock, it can open a pull request " +
      "unprompted, and it can never ask a question — so its instruction has to " +
      "stand on its own. " +
      "Start with minddy_list_projects to discover project ids.";

/**
 * Compatibility alias for code and tests written before discovery metadata was split.
 * New server initialization code must use `MCP_DISCOVERY_INSTRUCTIONS`.
 */
export const MCP_SERVER_INSTRUCTIONS = MCP_FULL_USAGE_GUIDE;
