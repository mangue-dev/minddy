/**
 * THE SUMMARY OF A TOOL CALL — what the thread prints from a `tool_call`, and all
 * what it will keep from it: the payload persisted in `agent_run_events` has nothing
 * else. A missing case goes to `{}`, and rereading the run displays
 * “Searching for “…”” or “0 tasks”.
 *
 * OUT of [agent-loop.ts](agent-loop.ts) by MIN-286, without changing a line.
 * Two engines must now produce the SAME event: the home loop, and the
 * translator of the opencode flow ([opencode-events.ts](vm/opencode-events.ts)). THE
 * leaving it private in the loop would have forced the second to copy it — that is to say
 * to diverge the thread of the two engines to the first added tool, while the
 * switch week is precisely there to verify that they are saying the same thing.
 *
 * PUR module: neither IO nor server-only import. It goes into the microVM bundle.
 */

/** `str` bounded to `max` characters, marked when it was cut. */
export function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** Compact summary of tool args for live view (never file content). */
export function toolArgSummary(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return { path: String(args.path ?? "") };
    case "move_file":
      return { from: String(args.from ?? ""), to: String(args.to ?? "") };
    case "apply_edits": {
      // The paths serve the LIVE “files changed” view (diff block per turn,
      // MIN-46): without them, a multi-file batch only appears as a counter.
      const changes = Array.isArray(args.changes) ? args.changes : [];
      return {
        count: changes.length,
        paths: changes
          .map((c) => String((c as Record<string, unknown>)?.path ?? ""))
          .filter(Boolean)
          .slice(0, 50),
      };
    }
    case "apply_patch": {
      // A patch is ONE big chain: we only keep the section headers,
      // for the same reason as the `apply_edits` paths — without them, the live view
      // “files changed” is blind on `gpt-*` runs (MIN-115). Reading
      // by regex, never a parse: a malformed patch must not break the event.
      const paths = [...String(args.patch ?? "").matchAll(/^\*\*\* (?:Add|Update|Delete) File:(.*)$/gm)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      return { count: paths.length, paths: paths.slice(0, 50) };
    }
    // `path` and `glob` are part of what search IS: without them, a
    // “(no matches)” due to too narrow a scope is indistinguishable from a real one
    // absence — this is what hid the pathspec braces bug (MIN-116).
    case "glob":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
      };
    case "grep":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
        ...(args.glob ? { glob: String(args.glob) } : {}),
        ...(args.fixed_strings === true ? { fixed_strings: true } : {}),
      };
    case "run_command":
      // `workdir` is part of what the command IS: without it, a `pnpm test`
      // launched in a subfolder is indistinguishable from the same launched at the root —
      // in live view as in `agent_run_events` (MIN-109).
      return {
        command: cap(String(args.command ?? ""), 100),
        ...(args.workdir ? { workdir: String(args.workdir) } : {}),
      };
    case "run_background":
      // The action AND its target: “check bg-2” and “start npm run dev” do not tell
      // not the same in live view nor in `agent_run_events`.
      return {
        action: String(args.action ?? ""),
        ...(args.command ? { command: cap(String(args.command), 100) } : {}),
        ...(args.job_id ? { job_id: String(args.job_id) } : {}),
      };
    case "create_pr":
      return { title: cap(String(args.title ?? ""), 200) };
    /**
 * PULL REQUESTS — those from the review session (MIN-168) and those
 * from the project (MIN-267). Without these cases, the reread thread had neither the targeted number,
 * nor the commented line, nor the verdict: "Rereading #0" on a
 * approval, and nothing at all on a merge.
 */
    case "comment_pr_line":
      return { path: String(args.path ?? ""), line: Number(args.line ?? 0) };
    case "reply_pr_thread":
      return { comment_id: Number(args.comment_id ?? 0) };
    case "read_pull_request":
    case "comment_pull_request":
      return { pull_request: Number(args.pull_request ?? 0) };
    case "comment_pull_request_line":
      return {
        pull_request: Number(args.pull_request ?? 0),
        path: String(args.path ?? ""),
        line: Number(args.line ?? 0),
      };
    case "reply_pull_request_thread":
      return {
        pull_request: Number(args.pull_request ?? 0),
        comment_id: Number(args.comment_id ?? 0),
      };
    case "review_pull_request":
      return {
        pull_request: Number(args.pull_request ?? 0),
        verdict: String(args.verdict ?? ""),
      };
    case "set_pull_request_state":
      return {
        pull_request: Number(args.pull_request ?? 0),
        state: String(args.state ?? ""),
        ...(args.merge_method ? { merge_method: String(args.merge_method) } : {}),
      };
    // Concluding or blocking: that's all the thread line needs to say,
    // and this is what decides the rest of the chain.
    case "report_verdict":
      return { ok: args.ok === true };
    case "read_page":
      return { page_id: String(args.page_id ?? "") };
    case "read_resource":
    case "read_attachment":
      return {
        resource_id: String(args.resource_id ?? args.attachment_id ?? ""),
      };
    case "read_feedback":
      return { feedback_post_id: String(args.feedback_post_id ?? "") };
    // Tools minddy (MIN-125). Without these cases, persisted events leave with
    // `{}` and the reread thread displays “Searching for “…”” or “0 tasks” — the
    // summary IS what the run replay has to tell the call.
    case "search_issues":
      return { query: cap(String(args.query ?? ""), 100) };
    case "read_issue":
      // `issue` only when it is passed: on the session ticket, its
      // absence is the information (“he reread HIS ticket”).
      return args.issue ? { issue: String(args.issue) } : {};
    case "write_issue_plan":
      return {
        chars: String(args.plan ?? "").length,
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "update_issue":
      return {
        fields: ["title", "description", "effort"].filter((f) => args[f] !== undefined),
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "create_issue":
      return { title: cap(String(args.title ?? ""), 200) };
    case "add_scratchpad_tasks":
    case "update_scratchpad_task":
      return { count: Array.isArray(args.tasks) ? args.tasks.length : 0 };
    case "set_scratchpad":
      return { chars: String(args.content ?? "").length };
    // Subagents (MIN-112). Without these cases, the persisted payload leaves at `{}` and the
    // folded block of the thread has nothing to display on replay: neither the mode nor the task,
    // nor the model on which the girl turned.
    case "spawn_agent":
      return {
        mode: String(args.mode ?? ""),
        task: cap(String(args.task ?? ""), 200),
        ...(args.model ? { model: String(args.model) } : {}),
        ...(args.thinking_effort ? { thinking_effort: String(args.thinking_effort) } : {}),
        ...(args.prompt_template ? { prompt_template: String(args.prompt_template) } : {}),
      };
    case "agent_status":
      return { id: String(args.id ?? "") };
    // `webfetch` does not have a house opposite (MIN-286): it arrives under the name
    // of opencode, with the schema measured on the binary (`{url, format?, timeout?}`).
    // Without this case it fell into the `default`, and the thread showed a reading of
    // page whose URL did not appear on screen or in `agent_run_events`.
    case "webfetch":
      return {
        url: cap(String(args.url ?? ""), 200),
        ...(args.format ? { format: String(args.format) } : {}),
      };
    default:
      return {};
  }
}
