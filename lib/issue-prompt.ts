import { parsePlan } from "@/lib/plan";
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
  /** Number of issue-level attachments — flagged in an <attachments> block so
      the agent knows files are attached (fetch them via the MCP if needed). */
  attachmentCount?: number;
}

/**
 * Le bloc `<issue>` partagé par les prompts (travailler sur le ticket, écrire
 * son plan) : les champs du ticket, tels quels, sans le plan — celui-ci n'est
 * JAMAIS inliné (potentiellement 64 Ko), l'agent le lit via le MCP.
 */
function issueBlock({
  issue,
  projectKey,
  categories,
  relations,
  attachmentCount,
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

  const attachmentsBlock =
    attachmentCount && attachmentCount > 0
      ? [`  <attachments count="${attachmentCount}" />`]
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
    ...attachmentsBlock,
  ];

  return `<issue>\n${fields.join("\n")}\n</issue>`;
}

/**
 * « Copier le prompt » (pattern Linear) : un prompt prêt à coller dans
 * n'importe quel agent (Claude Code, Cursor…) pour travailler sur un ticket.
 * TOUJOURS en anglais — le contenu du ticket est repris tel quel, mais tout
 * ce qui l'entoure est en anglais, quelle que soit la locale de l'UI.
 * Le plan n'est JAMAIS inliné (potentiellement 64 Ko) : le prompt renvoie
 * l'agent vers le MCP pour le lire — ou pour en écrire un s'il n'existe pas —
 * afin que le plan et son avancée restent logués dans minddy.
 */
export function buildIssuePrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  const plan = issue.plan ? parsePlan(issue.plan) : null;
  const hasPlan = !!plan && plan.tasks.length > 0;

  // Le MCP est un PLUS, jamais un prérequis : sans lui l'agent travaille
  // simplement à partir du bloc <issue>, sans solliciter l'utilisateur.
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
 * Variante « écrire le plan » du prompt : l'agent CADRE le ticket et rien de
 * plus — il explore le code, écrit le plan sur le ticket (via le MCP quand il
 * l'a, sinon en markdown dans sa réponse) et s'arrête avant d'implémenter.
 * Sert le bouton « Copier le prompt » de l'onglet Plan, quand celui-ci est vide.
 */
export function buildIssuePlanPrompt(input: IssuePromptInput): string {
  const { issue, projectId, projectKey } = input;
  const identifier = issueIdentifier(projectKey, issue.number);

  return `Write the implementation plan for this minddy issue. Do NOT implement it.

${issueBlock(input)}

Explore the codebase first, then write a real engineering plan in markdown: a short context (goal, approach), ordered checkbox tasks — \`- [ ]\` — naming the actual files, components and functions to touch, and a final verification step. Keep it concrete: no generic advice, no task the code doesn't call for.

Optionally, if minddy MCP tools are available in your environment (parameters for this issue: project_id "${projectId}", issue "${identifier}"):
- Read the full issue with \`minddy_get_issue\` first — its description, attachments and relations.
- Save the plan to the issue's \`plan\` field with \`minddy_update_issues\`, so the plan and its progress live in minddy.

If the minddy MCP tools are not available, that's fine — write the plan to a local markdown file (e.g. \`${identifier}-plan.md\`) and point me to it. Don't paste a long plan into your answer: a file is where I can actually read and keep it.

Stop once the plan is written: don't start implementing until I ask.`;
}
