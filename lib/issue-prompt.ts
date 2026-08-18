import { hasPlanTasks, parsePlan } from "@/lib/plan";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue, IssueRelationType } from "@/lib/types";

/** One relation to another issue, resolved from this issue's perspective:
 *  the relation type (`blocks`/`blocked_by`/`related`), the linked issue's
 *  identifier (e.g. MIN-10) and its title. */
export interface PromptRelation {
  type: IssueRelationType;
  identifier: string;
  title: string;
}

/** Everything a prompt needs to describe one issue to an agent. */
export interface IssuePromptInput {
  issue: Issue;
  projectId: string;
  projectKey: string;
  /** The issue's category names, listed in a <categories> block. */
  categories?: string[];
  /** This issue's relations to other issues, listed in a <relations> block so
      the agent knows what blocks it, what it blocks, and what it relates to. */
  relations?: PromptRelation[];
  /** Number of issue-level resources — flagged in a <resources> block so the
      agent knows files or links are attached (read them via the MCP if
      needed). */
  resourceCount?: number;
}

/**
 * The `<issue>` block shared by the prompts (work on the ticket, write
 * its plan): the fields of the ticket, as is, without the plan — this one is
 * NEVER inlined (potentially 64 KB), the agent reads it via the MCP.
 */
function issueBlock({
  issue,
  projectKey,
  categories,
  relations,
  resourceCount,
}: IssuePromptInput): string {
  const identifier = issueIdentifier(projectKey, issue.number);

  const categoriesBlock =
    categories && categories.length > 0
      ? [
          `  <categories>`,
          ...categories.map((c) => `    <category>${c}</category>`),
          `  </categories>`,
        ]
      : [];

  const relationsBlock =
    relations && relations.length > 0
      ? [
          `  <relations>`,
          ...relations.map(
            (r) =>
              `    <relation type="${r.type}">\n      <identifier>${r.identifier}</identifier>\n      <title>${r.title}</title>\n    </relation>`
          ),
          `  </relations>`,
        ]
      : [];

  const resourcesBlock =
    resourceCount && resourceCount > 0
      ? [`  <resources count="${resourceCount}" />`]
      : [];

  const fields = [
    `  <identifier>${identifier}</identifier>`,
    `  <title>${issue.title}</title>`,
    `  <status>${issue.status}</status>`,
    `  <priority>${issue.priority}</priority>`,
    ...(issue.effort ? [`  <effort>${issue.effort}</effort>`] : []),
    ...(issue.due_date ? [`  <due_date>${issue.due_date}</due_date>`] : []),
    ...categoriesBlock,
    ...(issue.description
      ? [`  <description>\n${issue.description}\n  </description>`]
      : []),
    ...relationsBlock,
    ...resourcesBlock,
  ];

  return `<issue>\n${fields.join("\n")}\n</issue>`;
}

/**
 * “Copy prompt” (Linear pattern): a prompt ready to paste into
 * any agent (Claude Code, Cursor, etc.) to work on a ticket.
 * ALWAYS in English — the content of the ticket is reproduced as is, but everything
 * what surrounds it is in English, whatever either the locale of the UI.
 * The plan is NEVER inlined (potentially 64 KB): the prompt sends
 * the agent to the MCP to read it — or to write one if it does not exist —
 * so that the plan and its progress remain logged in minddy.
 */
export function buildIssuePrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  const plan = issue.plan ? parsePlan(issue.plan) : null;
  const hasPlan = !!plan && plan.tasks.length > 0;

  // The MCP is a PLUS, never a prerequisite: without it the agent works
  // simply from the <issue> block, without asking the user.
  const planLine = hasPlan
    ? `An implementation plan already exists on this issue (${plan.progress.done}/${plan.progress.total} tasks done); it is intentionally not inlined here.`
    : "This issue has no implementation plan yet.";

  const mcpSteps = hasPlan
    ? "- Fetch the full issue and its implementation plan with `minddy_get_issue`, follow the plan, and keep task states updated with `minddy_update_plan_task` as you work (mark a task '- [~]' when you start it, '- [x]' when done)."
    : "- Before writing any code, produce a real implementation plan (short context, ordered checkbox tasks naming the actual files/components/functions to change, a final verification step) and save it to the issue's `plan` field with `minddy_update_issues`, then keep task states updated with `minddy_update_plan_task` as you execute it.";

  return `Work on this minddy issue.

${issueBlock(input)}

${planLine}

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
${mcpSteps}
- When you are done, report the outcome with \`minddy_add_comment\` and update the issue status with \`minddy_update_issues\`.

If the minddy MCP tools are not available, that's fine — just work on the issue as described above and skip the MCP steps.`;
}

/**
 * “Personalized” variant: the instruction is written by the USER, minddy
 * only provides what surrounds it — the `<issue>` block before, the MCP steps after.
 * The text entered is repeated VERBATIM, in the middle, in the language where it was
 * written : this is THE request, not a clarification added to "implements the ticket"
 * (which is therefore not there - otherwise the two instructions would compete for the agent).
 *
 * The plan is not inlined here either: the prompt only indicates that it
 * exists, and the agent reads it via the MCP if the instructions lead him there.
 */
export function buildIssueCustomPrompt(
  input: IssuePromptInput,
  instructions: string
): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  const plan = issue.plan ? parsePlan(issue.plan) : null;
  const hasPlan = !!plan && plan.tasks.length > 0;

  const planLine = hasPlan
    ? `An implementation plan already exists on this issue (${plan.progress.done}/${plan.progress.total} tasks done); it is intentionally not inlined here.`
    : "This issue has no implementation plan yet.";

  // Following the plan is NOT automatically required (the instruction is that of
  // the user) — but if he relies on it, his progress must remain lodged in
  // minddy rather than in the agent's head.
  const planStep = hasPlan
    ? "\n- If the instructions lead you to follow that plan, keep its task states updated with `minddy_update_plan_task` as you work (mark a task '- [~]' when you start it, '- [x]' when done)."
    : "";

  return `Work on this minddy issue, following the instructions below.

${issueBlock(input)}

${planLine}

Here is what I want you to do on this issue — these instructions are the request itself, so follow them rather than assuming the whole ticket has to be implemented:

${instructions.trim()}

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
- Read the full issue and its comments with \`minddy_get_issue\` — they carry the context this prompt doesn't inline.${planStep}
- When you are done, report the outcome with \`minddy_add_comment\`.

If the minddy MCP tools are not available, that's fine — just work on the issue as described above and skip the MCP steps.`;
}

/**
 * "Check implementation" variant: the work has already been done (at least
 * in part), we ask the agent to CONFRONTE it with what had been requested
 * — the plan AND the comments of the ticket, since this is where the deviations are discussed
 * — then to fix the bugs that it finds.
 *
 * “It is certain” is the central guideline: a speculative fix on
 * code that works costs more than the imagined bug, so what is not proven is reported instead of being “fixed”.
 *
 * The plan is NEVER inlined (potentially 64 KB): the agent reads it via the
 * MCP — and without MCP it asks for it rather than guessing what was intended.
 */
export function buildIssueVerifyPrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  const plan = issue.plan ? parsePlan(issue.plan) : null;
  const hasPlan = !!plan && plan.tasks.length > 0;

  const planLine = hasPlan
    ? `An implementation plan exists on this issue (${plan.progress.done}/${plan.progress.total} tasks done); it is intentionally not inlined here, so read it before judging anything.`
    : "This issue has no implementation plan: the issue above and its comments are the whole specification.";

  const planMcpStep = hasPlan
    ? "\n- Correct the plan's task states with `minddy_update_plan_task` when they lie: a task marked done that the code doesn't actually implement goes back to '- [ ]'."
    : "";

  const noMcpLine = hasPlan
    ? "If the minddy MCP tools are not available, ask me to paste the plan and the comments of this issue before verifying anything — don't guess at what was asked."
    : "If the minddy MCP tools are not available, that's fine — verify against the issue as described above, and ask me for its comments rather than assuming nothing was discussed.";

  return `Verify the implementation of this minddy issue, then fix what is actually broken.

${issueBlock(input)}

${planLine}

Start with what was asked: the issue above, its implementation plan and its comments — the thread is where the work was specified and where any departure from the plan was argued, so read it too. Then read the code that implements it and compare the two: is every task marked done really done, and done the way it was specified? Where the code departs from the plan, say so and tell me which of the two is right — the code is sometimes the better answer, the plan isn't sacred.

Then hunt for bugs in that code: broken edge cases, wrong or missing states, call sites the change forgot to update, something the plan asked for that was silently skipped. Fix each bug you can actually prove by reading the surrounding code, and check every fix (run the tests, typecheck and lint the repo already has). Anything you merely suspect, report it instead of "fixing" it: a speculative change to working code costs more than the bug you imagined. Don't refactor what works, and stay inside this issue's scope.

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
- Read the full issue, its plan and its comments with \`minddy_get_issue\` — the comments are part of the spec, not a side channel.${planMcpStep}
- Report what you verified, what you fixed and what you left alone with \`minddy_add_comment\`.

${noMcpLine}`;
}

/**
 * “frame the ticket” variant of the prompt: the agent works the PLAN and nothing
 * more — it explores the code, writes the plan on the ticket (via the MCP when
 * it has it, otherwise in markdown in its response) and stops before implementing.
 * Serves the button “ Copy the prompt » from the Plan tab.
 *
 * The plan already exists → we do not ask you to write it again: the prompt switches to
 * a point-by-point REREADING (`buildIssuePlanReviewPrompt`).
 */
export function buildIssuePlanPrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  if (hasPlanTasks(issue.plan)) return buildIssuePlanReviewPrompt(input);

  return `Write the implementation plan for this minddy issue. Do NOT implement it.

${issueBlock(input)}

Explore the codebase first, then write a real engineering plan in markdown: a short context (goal, approach), ordered checkbox tasks — \`- [ ]\` — naming the actual files, components and functions to touch, and a final verification step. Keep it concrete: no generic advice, no task the code doesn't call for.

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
- Read the full issue with \`minddy_get_issue\` first — its description, resources and relations.
- Save the plan to the issue's \`plan\` field with \`minddy_update_issues\`, so the plan and its progress live in minddy.

If the minddy MCP tools are not available, that's fine — write the plan to a local markdown file (e.g. \`${identifier}-plan.md\`) and point me to it. Don't paste a long plan into your answer: a file is where I can actually read and keep it.

Stop once the plan is written: don't start implementing until I ask.`;
}

/**
 * "Check plan" variant: the ticket ALREADY has a plan, so we don't ask
 * to write one — the agent takes it task by task when faced with the real code,
 * corrects what has drifted, and stops before implementing.
 * The plan is not inlined (potentially 64 KB): the agent reads it via the MCP,
 * and without MCP it requests it rather than inventing it.
 */
export function buildIssuePlanReviewPrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);
  const { progress } = parsePlan(issue.plan);

  return `Review the implementation plan of this minddy issue, task by task. Do NOT implement it.

${issueBlock(input)}

This issue already has an implementation plan (${progress.done}/${progress.total} tasks done); it is intentionally not inlined here, so read it before saying anything about it.

Then go through it one task at a time, checking each against the real code: is it still accurate (right files, right components, right approach), still needed, and in the right order? Is a step missing, or vague enough to be useless? Correct what has drifted, drop what the code no longer calls for, add what's missing, and make sure the plan ends on a verification step. Leave completed tasks — \`- [x]\` — and their progress alone: they describe work already done.

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
- Read the full issue and its plan with \`minddy_get_issue\` first — plus its description, resources and relations.
- Save the corrected plan back to the issue's \`plan\` field with \`minddy_update_issues\`, preserving the task markers of everything already done.

If the minddy MCP tools are not available, ask me to paste the current plan before reviewing it — don't guess at what it contains.

Report what you changed and why, then stop: don't start implementing until I ask.`;
}
