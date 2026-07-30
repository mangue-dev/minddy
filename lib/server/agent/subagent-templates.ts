/**
 * Prompts à trous des sous-agents (MIN-112). Module PUR, comme `background.ts` :
 * aucun accès base, aucun `server-only`, testable en vitest.
 *
 * Le pourquoi : un sous-agent n'a QUE son prompt. Pas de ticket, pas d'historique,
 * personne à qui poser une question. Un briefing bâclé (« regarde le auth ») ne
 * produit pas un rapport bâclé — il produit un aller-retour perdu, payé au prix du
 * modèle. Les templates ne servent donc pas à écrire à la place du parent : ils
 * imposent le CADRAGE (où chercher, quoi rendre, ce qu'il ne faut pas toucher) et
 * laissent le parent remplir le fond.
 *
 * Ce que le template n'ajoute PAS : `task` et `expected_output`. Ces deux-là sont
 * portés par le tool `spawn_agent` lui-même et injectés autour du cadrage — un
 * template ne peut donc pas les « oublier ».
 */

/** Variables reconnues dans un template, dans l'ordre où elles y apparaissent. */
export type SubagentTemplateVariable = "task" | "expected_output" | "file_path" | "constraints";

export interface SubagentTemplate {
  id: string;
  /** Libellé lisible, servi au prompt système du parent. */
  label: string;
  /** Variables REQUISES (les autres du template sont optionnelles). */
  variables: SubagentTemplateVariable[];
  /** Variables acceptées mais facultatives (rendues seulement si fournies). */
  optional: SubagentTemplateVariable[];
  render(vars: Partial<Record<SubagentTemplateVariable, string>>): string;
}

/** Bloc optionnel : rendu seulement quand la variable est fournie et non vide. */
function block(title: string, value: string | undefined): string {
  const v = value?.trim();
  return v ? `\n\n${title}\n${v}` : "";
}

/**
 * Les quatre templates de la v1. Choisis pour couvrir ce qu'on délègue vraiment :
 * comprendre du code, écrire du code, écrire des tests, écrire de la doc. En
 * anglais, comme tout ce qui part au modèle.
 */
export const SUBAGENT_TEMPLATES: SubagentTemplate[] = [
  {
    id: "explore",
    label: "Explore the codebase and report what you found",
    variables: ["task"],
    optional: ["file_path", "constraints"],
    render: (v) =>
      `Explore this repository and report your findings. You are NOT changing any file — this is a read-only investigation.

## What to find out
${v.task?.trim() ?? ""}${block("## Where to start", v.file_path)}${block("## Constraints", v.constraints)}

## How to work
1. Locate the relevant code with \`glob\` / \`grep\` / \`list_dir\` before reading anything.
2. \`read_file\` what matters, and follow the call chain rather than guessing at it.
3. Report only what you actually read. Every claim carries its \`path:line\`.
4. If the answer is not in the repository, say so — do not fill the gap with what is usually true.`,
  },
  {
    id: "implement",
    label: "Implement a defined change and report the diff",
    variables: ["task", "expected_output"],
    optional: ["file_path", "constraints"],
    render: (v) =>
      `Implement the following change in this repository, then report what you did.

## The change
${v.task?.trim() ?? ""}${block("## Files involved", v.file_path)}${block("## Constraints", v.constraints)}

## How to work
1. Read the code you are about to change, and the code around it — match its conventions, naming and style.
2. Keep the diff minimal: change what the task needs and nothing else. No drive-by refactors, no reformatting.
3. Verify what you can with the project's own commands (type-check, lint, the relevant tests). Read the failures and fix them.
4. Do NOT touch files outside the scope above: this sandbox is SHARED with the agent that delegated to you.`,
  },
  {
    id: "test",
    label: "Write tests for existing code",
    variables: ["task", "file_path"],
    optional: ["expected_output", "constraints"],
    render: (v) =>
      `Write tests for existing code in this repository, then report what you covered.

## What to cover
${v.task?.trim() ?? ""}

## Code under test
${v.file_path?.trim() ?? ""}${block("## Constraints", v.constraints)}

## How to work
1. Read the code under test AND an existing test file next to it — reuse the project's test runner, helpers and conventions rather than inventing your own.
2. Test BEHAVIOUR, not implementation details. Cover the edge case that would actually break, not a restatement of the code.
3. RUN the tests you wrote and make them pass. A test you did not run is not a test.
4. Do not change the code under test to make a test pass — report the discrepancy instead.`,
  },
  {
    id: "docs",
    label: "Write or update documentation",
    variables: ["task"],
    optional: ["file_path", "expected_output", "constraints"],
    render: (v) =>
      `Write or update documentation in this repository, then report what you changed.

## What to document
${v.task?.trim() ?? ""}${block("## File to write", v.file_path)}${block("## Constraints", v.constraints)}

## How to work
1. Read the code you are documenting first: the doc must describe what the code DOES, not what it was meant to do.
2. Follow the existing docs' language, tone and structure (they may be in French — keep the file's own language).
3. Do not document what you did not read, and do not invent examples you have not checked against the code.
4. Touch only documentation files unless the task says otherwise.`,
  },
];

const BY_ID = new Map(SUBAGENT_TEMPLATES.map((t) => [t.id, t]));

/** Ids servis dans les messages d'erreur ET dans le prompt système du parent. */
export const SUBAGENT_TEMPLATE_IDS = SUBAGENT_TEMPLATES.map((t) => t.id);

/** Levée par `renderSubagentPrompt` : le message part au modèle comme erreur de tool. */
export class SubagentTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubagentTemplateError";
  }
}

/**
 * Bibliothèque rendue pour le prompt système du parent : un template par ligne,
 * avec ses variables requises et optionnelles. C'est ce que l'agent lit pour
 * choisir — il ne voit jamais le corps des templates.
 */
export function describeTemplates(): string {
  return SUBAGENT_TEMPLATES.map((t) => {
    const required = t.variables.map((v) => `{{${v}}}`).join(", ");
    const optional = t.optional.length
      ? ` — optional: ${t.optional.map((v) => `{{${v}}}`).join(", ")}`
      : "";
    return `- \`${t.id}\` — ${t.label}. Requires ${required}${optional}.`;
  }).join("\n");
}

/** Lit `template_vars` sans faire confiance à sa forme (JSON du modèle). */
function readVars(raw: unknown): Partial<Record<SubagentTemplateVariable, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<SubagentTemplateVariable, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value == null) continue;
    out[key as SubagentTemplateVariable] = String(value);
  }
  return out;
}

/**
 * Rend le prompt de cadrage d'un sous-agent.
 *
 * Sans `templateId` : le `task` brut est renvoyé tel quel — déléguer sans template
 * reste permis (le parent sait parfois mieux). Template inconnu → erreur qui LISTE
 * les ids ; variable requise manquante → erreur qui la NOMME. Dans les deux cas le
 * modèle lit pourquoi et corrige au round suivant, sans qu'aucun sous-agent n'ait
 * été lancé.
 *
 * `task` et `expected_output` du tool sont injectés dans les variables : un
 * template qui les demande les reçoit sans que le parent ait à les répéter.
 */
export function renderSubagentPrompt(opts: {
  templateId?: string | null;
  vars?: unknown;
  task: string;
  expectedOutput: string;
}): string {
  const id = opts.templateId?.trim();
  if (!id) return opts.task.trim();

  const template = BY_ID.get(id);
  if (!template) {
    throw new SubagentTemplateError(
      `Unknown prompt_template ${JSON.stringify(id)}. Available templates: ${SUBAGENT_TEMPLATE_IDS.join(", ")} — or omit prompt_template to send your task as-is.`,
    );
  }

  const vars = {
    task: opts.task,
    expected_output: opts.expectedOutput,
    ...readVars(opts.vars),
  };
  const missing = template.variables.filter((v) => !vars[v]?.trim());
  if (missing.length > 0) {
    throw new SubagentTemplateError(
      `Template ${JSON.stringify(id)} needs ${missing
        .map((v) => `template_vars.${v}`)
        .join(" and ")}. Required variables: ${template.variables.join(", ")}.`,
    );
  }

  return template.render(vars);
}
