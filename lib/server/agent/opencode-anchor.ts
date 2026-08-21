import {
  LOOP_TOOL_NAMES,
  backgroundToolNote,
  OPENCODE_TOOL_NAMES,
  anchorRulesSection,
  askingSection,
  buildPrReviewSystemPrompt,
  chainSection,
  GIT_REFUSALS_CURRENT_REPO,
  grepPatternNote,
  introBlock,
  minddyToolsBlock,
  projectPrSection,
  rulesTail,
  shellOutputNote,
  untrustedContentSection,
  workflowSteps,
  type AgentAnchor,
} from "./prompt";
import type { FavoriteSubagentModel } from "./subagent-config";

/**
 * THE MINDDY ANCHOR SERVED AT OPENCODE (MIN-286) — the text that the supervisor writes
 * in `OPENCODE_ANCHOR_FILE` and that opencode adds to ITS system prompt
 * (`instructions`, measured: the contents of the file land in the message system,
 * docs/harness-opencode.md §2.8).
 *
 * ─────────────────────── ─────────────────────── ───────────────────────────────
 * WHAT IT SAYS, AND WHAT IT DOES NOT SAY
 *
 * The opencode prompt ALREADY describes its file tools and its shell: the
 * to redescribe here, less well, is to contradict itself in the same system message. This
 * document therefore only carries what opencode cannot know:
 *
 * 1. **who the agent is** in minddy, and what this session is anchored to
 * (ticket / notebook / reread);
 * 2. **the 32 domain tools** and their doctrine (the ticket plan belongs to
 * the user, a status is never written, a PR remark is rationed);
 * 3. **what HARNESS imposes on its tools**: git belongs to us and the
 * shell refuses which destroys work, web search is ours and
 * capped, one question ENDS the round, the delivery gate of the first
 * `create_pr`.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * WHY IS THIS THE SAME TEXT AS THE HOUSELOOP
 *
 * Everything that is product doctrine comes from the shared fragments of
 * [prompt.ts](prompt.ts) — the `PromptToolNames` table being the only thing that
 * varies. A copy would have diverged at the first adjustment, and the divergence se
 * would be read in the behavior of the runs without anyone knowing why:
 * this is exactly what the switch week must be able to rule out ("same
 * events, same order, same costs").
 *
 * Which is written HERE and nowhere else is what MEASURE made
 * different at opencode, and nothing else:
 * - `task` **blocks** the parent until the daughter has reported (§2.14, fault
 * of `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`) — so “you never wait,
 * you never probe" becomes false, and saying it false would make the model
 * wait in front of a tool which has already rendered ;
 * - the model of a girl is carried by the NAME of the agent (`explore-<slug>`), not
 * by an argument ;
 * - there is no BATCH editing (§3.2);
 * - `run_background` is a US tool, no opencode: its `bash` does not have a
 * background mode, so the harness rests it and describes it (§3.2, lot 3).
 */

export interface OpencodeAnchorInput {
  locale?: string | null;
  anchor?: AgentAnchor;
  /** False for a ROUTINE passage: no `question`, and the PR mandate. */
  interactive?: boolean;
  webSearch?: boolean;
  webSearchMax?: number;
  chain?: boolean;
  images?: boolean;
  /**
 * DOES THE TURN PLAY IN THE USER CHECKOUT (MIN-358)?
 *
 * Three lines of the git block become false in current repository mode, and
 * each costs human labor when not said: the repository is
 * no longer disposable, `git status` is no longer the model diff, and the history
 * is no longer a six-month window (see `gitOwnershipBlock`).
 */
  currentRepo?: boolean;
  /**
   * Does this run have a LINKED FORGE REPOSITORY? `true` by default. `false`
   * for a local run on a project with no linked repository (MIN-local-norepo):
   * no push, no pull request — `create_pr` is not served, and every sentence
   * that promises a remote goes.
   */
  hasRepo?: boolean;
  /** Is delegation offered, and on which models? Absent = no `task`. */
  subagents?: {
    favorites: Array<FavoriteSubagentModel & { multiplier?: number }>;
    models: boolean;
    maxMultiplier?: number | null;
  };
}

const n = OPENCODE_TOOL_NAMES;

/**
 * WHAT HARNESS CHANGES TO OPENCODE TOOLS. Only deviations: each
 * line exists because a model that doesn't read it is actually wrong — it
 * attempts a `git commit` (refused), it looks for a batch edit (non-existent), it
 * waits for an answer after a question (the round is over), or it calls the
 * `websearch` of opencode (turned off, and out of our counters).
 */
function harnessDeltas(input: OpencodeAnchorInput): string {
  const routine = input.interactive === false;
  const hasRepo = input.hasRepo !== false;
  const lines = [
    // The denial list is that of `command-guard`, and it IS NOT the same
    // on both sides from D6: `git commit` is returned to the model in deposit mode
    // fluent. Repeating it here without the scope would make the harness say the opposite of what
    // that it executes — the defect in §1 of the audit, one line below.
    input.currentRepo === true
      ? `- **Your shell enforces what git may not do here.** ${GIT_REFUSALS_CURRENT_REPO(n, hasRepo)} See ${hasRepo ? "Git and pull requests" : "Git"} below for who delivers.`
      : `- **The harness owns git, and your shell enforces it.** \`${n.shell}\` REFUSES the commands that would destroy work or fight it — \`git commit\`, \`git push\`, \`git reset\`, \`git restore\`, \`git checkout -- <file>\`, \`git rebase\`, \`git cherry-pick\`, \`git stash drop/clear\`, \`git clean -f\`, \`--amend\` — and the call comes back as an error, wrapped in \`bash -c\` included. Read-only git and \`git add\` are free. See ${hasRepo ? "Git and pull requests" : "Git"} below for what happens instead.`,
    `- ${shellOutputNote(n)}`,
    `- **To rename or remove a file, use \`${n.shell}\`** (\`mv\`, \`rm\`): the end-of-turn commit picks them up like any other change.`,
    `- **There is no batch-edit tool.** One \`edit\` call changes one place; chain them rather than looking for a multi-edit. Read the file before editing it, and copy \`oldString\` verbatim from what \`${n.read}\` showed.`,
    `- ${grepPatternNote()}`,
    // `bash` does not have a background mode: this tool comes from us, so the prompt
    // of opencode says nothing about it and this is where it describes itself.
    `${backgroundToolNote(n)}`,
    `- **\`update_plan\` is this session's checklist**, and the only one: any local todo list is off, because your checklist MIRRORS onto the ticket's plan. Keep exactly one step \`in_progress\`; skip it for trivial or conversational turns.`,
  ];
  if (input.webSearch) {
    lines.push(
      `- **\`web_search\` is the only way to the web** — the built-in web search is off, and the sandbox has no other internet access. Read the repo first (package.json, the lockfile, the dependency's own files, the repo's docs) and search only when the answer isn't there. Each search costs money: one focused query, never the same one twice.${
        input.webSearchMax != null
          ? ` You get ${input.webSearchMax} searches for this turn, shared with your sub-agents — past that every call comes back as an error.`
          : ""
      }`,
    );
  }
  if (!routine) {
    lines.push(
      // MIN-364 (D7): the question BLOCKS on the user's machine, and it
      // there's nothing to do about that — the opencode tool already blocks itself.
      // Telling him the opposite would make him finish everything before asking, and read his
      // own turn as lost at the moment he asks.
      input.currentRepo === true
        ? `- **\`${n.ask}\` SUSPENDS your turn — it does not end it.** The call blocks, the user answers, and their answer comes back to you as the tool's own result: you keep your context, your plan and your open files. Ask the moment the answer changes what you would write, and put everything blocking the same piece of work in ONE call.`
        : `- **\`${n.ask}\` ENDS your turn.** It is not a blocking prompt: the questions go to the user, the session goes to sleep, and their answers open your next turn. So ask everything blocking the same piece of work in ONE call, and never call it for something you can decide yourself.`,
    );
  }
  return `## What minddy's harness changes about your tools
${lines.join("\n")}`;
}

/**
 * Delegation at opencode: the tool `task`, one agent per (mode × model).
 *
 * The doctrine is that of MIN-112 — delegate what is broad but whose conclusion is short, do not delegate what takes two calls, one only
 * writer, the report as the only deliverable. What changes, and it is measured: the
 * tool **blocks**, there is therefore neither poll nor awakening, and the girl's model chooses
 * by choosing her `subagent_type`.
 */
function delegationSection(input: OpencodeAnchorInput): string {
  const subs = input.subagents;
  if (!subs) return "";
  const hasRepo = input.hasRepo !== false;
  const ceiling = subs.maxMultiplier;
  const costNote = subs.favorites.some((f) => f.multiplier != null)
    ? `
- **A model choice is a money choice.** \`×N\` is what a model costs against this account's default model, per token: delegating a grep to a ×30 model is money burnt. Match the model to the job.${
        ceiling != null
          ? ` Anything above ×${ceiling} is not available on this account's plan and is simply not in the list.`
          : ""
      }`
    : "";
  const modelsNote = subs.models
    ? `
- **The agent type carries the MODEL.** \`explore\` and \`general\` run on your own model; the \`explore-<model>\` / \`general-<model>\` variants run on the model their name says, and the list served with the tool describes what each one is good for. Ask for a type that is not in that list and the call comes back with the list — pick from it.${costNote}`
    : `
- Every sub-agent runs on your own model: this session's provider serves a single model family.`;
  return `

## Delegating to sub-agents
- A sub-agent is a CHILD SESSION: its own context, working in the SAME sandbox as you. You brief it, it works, and it hands you back a text REPORT. Its exploration never enters your context — that is the whole point of delegating.
- **Delegate when** the work is broad but its conclusion is short (find every caller of X, map how a feature is wired), or when a task would flood your context with output you do not need to keep.
- **Do NOT delegate** a change you can make in two tool calls: briefing a child and reading its report costs more than doing it yourself, and it leaves you trusting a summary where you could have read the code.
- **\`${n.spawn}\` BLOCKS until the child is done.** There is nothing to poll and nothing to wait for by hand — when the call returns, the report is there. Several children of the SAME round run at once; a round that calls it once waits for that one.
- **One writer at a time.** \`explore\` types are read-only and parallelise freely. A \`general\` type edits the repository, so while one is in flight your own editing tools are refused${
    hasRepo ? " and so is `create_pr`" : ""
  } — the sandbox is shared, and the harness commits everything it finds at the end of the turn, half-written work included.
- **The report is all you get back.** The child cannot ask you anything and you cannot ask it a follow-up, so write \`prompt\` as a complete briefing — what to do, where (paths, symbols), what not to touch, and the exact shape of the answer you need. When a claim from a report matters, check it in the repository yourself.
- It has none of your context: not this conversation, not the ticket, not the notebook, not the pull request — and it cannot delegate further.${modelsNote}`;
}

/**
 * The complete anchor of a turn. A REVIEW session keeps her persona to herself
 * (MIN-168): neither editing, nor git, nor pull request to open — serving the anchor of the
 * under amputated would make her promise gestures that she cannot do.
 */
export function buildOpencodeAnchor(input: OpencodeAnchorInput): string {
  if (input.anchor === "pr") {
    return buildPrReviewSystemPrompt({ locale: input.locale, images: input.images, n });
  }
  const routine = input.interactive === false;
  const notebook = input.anchor === "notebook";
  const hasRepo = input.hasRepo !== false;
  const replyLanguage = input.locale === "fr" ? "French" : "English";
  const validateTool = `- \`validate_changes\` — run an explicit preflight of the current worktree (type-check, tests, diff review).`;
  const anchorTools = !hasRepo
    ? validateTool
    : notebook
      ? `${validateTool}
- \`create_pr\` — publish this session's pull request when there is none yet (see Git below).`
      : `${validateTool}
- \`create_pr\` — publish the ticket's pull request when there is none yet (see Git below).`;
  const chainTool = input.chain
    ? `
- \`report_verdict\` — close this run with its VERDICT, because it is a step of an automated chain (see below).`
    : "";
  return `${introBlock({ notebook, routine })}

${harnessDeltas(input)}

## minddy's own tools
${anchorTools}${chainTool}
${minddyToolsBlock({ images: input.images === true, routine })}

${anchorRulesSection({
  notebook,
  routine,
  n,
  currentRepo: input.currentRepo === true,
  hasRepo,
})}${hasRepo ? projectPrSection(routine) : ""}${delegationSection(input)}

${workflowSteps({
  routine,
  n,
  hasRepo,
  // The opencode edit is ours, except for its name: `edit.ts` is borrowed from
  // opencode (docs §3.1), so the advice for a missing `oldString` applies word
  // for word—the tool name is the only thing that changes.
  failedEditAdvice: `If an \`edit\` fails because \`oldString\` wasn't found, re-read the file and copy the exact current text.`,
})}

${askingSection({ routine, n, currentRepo: input.currentRepo === true })}${chainSection(input.chain === true)}${untrustedContentSection({ notebook })}${rulesTail(replyLanguage, input.currentRepo === true)}`;
}

/**
 * Guardrail for the name table: no name from the home-grown loop may survive
 * in the anchor served to opencode. Exported so the test can replay it across
 * every variant instead of checking only one.
 */
export const LEGACY_TOOL_NAMES = [
  LOOP_TOOL_NAMES.read,
  LOOP_TOOL_NAMES.list,
  LOOP_TOOL_NAMES.shell,
  // `background` is NOT in this list: since batch 3, `run_background` is served
  // by both engines under the same name (the harness restores it in the microVM),
  // so it no longer reveals a copy of the home-grown loop's prompt.
  LOOP_TOOL_NAMES.ask,
  LOOP_TOOL_NAMES.spawn,
  "apply_edits",
  "edit_file",
  "write_file",
  "move_file",
  "delete_file",
  "agent_status",
  "list_agents",
] as const;
