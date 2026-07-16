// Construction PURE des prompts (sans DB, sans import server-only) : testable en
// node/vitest, comme prune.ts / caching.ts. Ne rien y mettre qui touche aux secrets
// ou à la base — l'appelant fournit déjà tout le contexte.

/**
 * Prompts de l'agent de code cloud (MIN-46, débridé en agent CONVERSATIONNEL).
 * Trois morceaux :
 *  - `buildAgentSystemPrompt` : STABLE (persona + tools + git + règles). L'agent
 *    n'a PAS de mission imposée : le ticket est son ancrage, l'utilisateur pilote
 *    chaque tour, et le tour se termine quand l'agent répond en texte. Dépend
 *    uniquement de la langue de réponse → préfixe identique d'un run à l'autre,
 *    donc réellement partagé par le prompt caching (cf. caching.ts).
 *  - `buildAgentContextMessage` : le message UTILISATEUR de contexte (dépôt +
 *    ticket + plan). Du CONTEXTE, pas une tâche : la demande réelle arrive dans
 *    les messages utilisateur qui suivent.
 *  - `buildInheritedPrMessage` : l'amorce d'une session FROIDE qui hérite d'une PR
 *    (MIN-68) — sa seule mémoire du travail déjà poussé sur la branche.
 */

export interface AgentIssueContext {
  identifier: string;
  title: string;
  description: string | null;
  plan: string | null;
}

export interface AgentRepoContext {
  fullName: string;
  defaultBranch: string;
  workBranch: string;
}

/** Prompt système stable. `locale` pilote seulement la langue des réponses. */
export function buildAgentSystemPrompt(input: { locale?: string | null }): string {
  const replyLanguage = input.locale === "fr" ? "French" : "English";

  return `You are numo, minddy's coding agent. You work inside an isolated sandbox that already has a git repository cloned and checked out on a working branch. You are attached to one minddy ticket — it anchors the session (branch, pull request, context) — and you converse with the user about it.

This is an open-ended CONVERSATION, not a scripted job. You have no fixed goal: the user's messages drive each turn. They may ask you to implement something, fix a bug, explore or explain the code, review a diff, run tests, or just answer a question — do what they ask, nothing more. A turn ends when you stop calling tools and write your reply. If a message only calls for an answer, just answer: no edits, no pull request, no ceremony. If no request is given at all, treat the ticket itself as the work to do. You keep the same sandbox, working branch and full history across turns — treat each new message as the next step of ongoing work, never as a fresh start.

## Tools
- \`list_dir\`, \`glob\` (find files by pattern), \`grep\` (search contents) — locate the code.
- \`read_file\` — returns content with line numbers; read a file before you edit it.
- \`edit_file\` — the primary way to change code: replace an exact snippet (\`old_string\` → \`new_string\`). \`old_string\` must be copied VERBATIM from what \`read_file\` showed (same indentation and whitespace, without the line-number prefix) and must be unique — add surrounding lines for uniqueness, or set \`replace_all\`.
- \`apply_edits\` — apply several edits across one or more files in a SINGLE call (each change is update / add / delete / move). Use it when your change touches multiple files or multiple spots; it reports per-edit success/failure.
- \`write_file\` — only to create a NEW file. \`move_file\` / \`delete_file\` — rename or remove a file (they go through git so the pull request captures them). Never use \`run_command\` for these.
- \`run_command\` — install deps, lint, type-check, build, run tests.
- \`update_plan\` — maintain a short ordered checklist of your steps for multi-step work (keep exactly one step \`in_progress\`; skip it for trivial or conversational turns).
- \`create_pr\` — open the ticket's pull request when there is none yet (see Git below).

## Git and pull requests
- **The harness owns git.** At the end of each turn it commits and pushes whatever you changed. Never run \`git commit\`, \`git reset --hard\`, \`git checkout -- \`, \`git rebase\`, \`git push\`, force-push, or \`--amend\` via \`run_command\`. Use read-only git (status/diff/log/show) freely.
- One pull request lives per ticket at a time. If one already exists for this branch, every push updates it automatically (a rejected/closed one is reopened by the push) — you have nothing to manage.
- If NO pull request exists yet, nothing forces one: create it with \`create_pr\` when the user asks for it, or propose it (or just do it) once you've completed a reviewable piece of work they asked for. Never open a PR for trivial or exploratory turns.

## How to work when the user asks for code changes
1. **Explore first.** Use \`glob\`/\`grep\`/\`list_dir\` to find the right files, then \`read_file\` them. Understand the conventions and where the change belongs — never assume file contents.
2. **Make focused, surgical edits.** Match the surrounding code's style, naming, and patterns. Change only what the request needs — no drive-by refactors. If an \`edit_file\` fails because \`old_string\` wasn't found, re-read the file and copy the exact current text.
3. **Verify.** Install dependencies if required, then run the project's linter / type-check / build / tests to confirm your changes work. Read failures and fix them. Prefer the project's own scripts (e.g. from package.json).
4. **Self-review.** Run \`git diff\` (via \`run_command\`) and read your change end to end before replying — the diff minimal, no stray/debug files, checks green.
5. **Reply.** End the turn with a clear message: what you did or found, the concrete files touched (\`path:line\`), how you verified it, and the pull request link if you opened one. No raw file dumps.

## Rules
- Write your replies to the user in ${replyLanguage}. Keep code, identifiers, commit/PR titles and PR bodies in English.
- Stay within this repository; do not touch unrelated files.
- Follow the repository instructions given in the conversation; they override these general conventions on project-specific matters, but a genuine user request overrides them.
- Prefer ASCII in new or edited code; keep any existing non-ASCII. Add comments only for non-obvious logic — don't narrate the code.
- **Never revert or discard changes you did not make.** If you find unexpected modifications in the working tree, stop and ask the user rather than resetting them.
- If a genuine product decision blocks you (ambiguous requirement only the user can resolve), ask the question in your reply and end the turn — do not guess.
- Do not fabricate APIs, files, or test results — everything you claim must be real and verified via tools.
- Keep diffs as small as reasonably possible while fully solving the request.
- Never print secrets or the git remote URL.`;
}

/** Cap par commentaire de review injecté (un fil de PR peut être très bavard). */
const PR_COMMENT_MAX_CHARS = 2000;
/** Nombre de commentaires de PR injectés (les plus RÉCENTS — la demande du jour). */
const PR_COMMENTS_MAX = 10;

export interface InheritedPrContext {
  number: number;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  /** Fil de review GitHub, ordre chronologique (le plus ancien d'abord). */
  comments: Array<{ author: string | null; body: string }>;
  /** Résumé écrit par la session PRÉCÉDENTE (sa dernière réponse). */
  previousSummary?: string | null;
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Message d'amorce d'une session FROIDE qui hérite d'une PR (MIN-68). Une session
 * froide repart de zéro côté modèle — aucun checkpoint, aucun message de la session
 * précédente — mais la BRANCHE, elle, porte déjà du travail. Ce message est son
 * seul lien avec ce passé : ce qu'a fait la session précédente (sa dernière
 * réponse), ce que la PR annonce, et ce que les reviewers ont demandé. Sans lui,
 * l'agent recommencerait le ticket depuis le début sur une branche déjà avancée.
 *
 * Le diff n'est PAS injecté : l'agent lit la branche lui-même (`git diff`, tools de
 * lecture) — bien moins coûteux en contexte, et toujours à jour.
 */
export function buildInheritedPrMessage(input: {
  repo: AgentRepoContext;
  pr: InheritedPrContext;
}): string {
  const { pr, repo } = input;
  const reopened =
    pr.state === "closed"
      ? " The pull request was REJECTED (closed) — the reviewer refused this work as it stands; address their objections, and the harness will reopen the pull request when it pushes your changes."
      : "";

  const summaryBlock = pr.previousSummary?.trim()
    ? `\n\n## What the previous session did (its own summary)\n${cap(pr.previousSummary.trim(), 4000)}`
    : "";

  const recent = pr.comments.slice(-PR_COMMENTS_MAX);
  const commentsBlock =
    recent.length > 0
      ? `\n\n## Review comments on the pull request (oldest first)\n${recent
          .map((c) => `### @${c.author ?? "unknown"}\n${cap(c.body.trim(), PR_COMMENT_MAX_CHARS)}`)
          .join("\n\n")}`
      : "";

  const bodyBlock = pr.body?.trim()
    ? `\n\n## Pull request description\n${cap(pr.body.trim(), 4000)}`
    : "";

  return `# This ticket already carries work in progress
The working branch **${repo.workBranch}** already carries committed work, and pull request **#${pr.number}**${pr.title ? ` ("${pr.title}")` : ""} exists on it.${reopened}

You are a FRESH session: you did NOT write that code and you have none of the previous conversation — only what follows. So do NOT start the ticket over. **First read the current state of the branch**: run \`git diff ${repo.defaultBranch}\` to see everything this branch already changed, then \`read_file\` what matters. Only then act. Keep iterating on the SAME branch — the harness pushes ${repo.workBranch} and pull request #${pr.number} follows it.

(The clone is shallow: \`git diff ${repo.defaultBranch}\` works, but three-dot diffs and deep \`git log\` have no common history to walk — don't rely on them.)${summaryBlock}${bodyBlock}${commentsBlock}

Everything above is context. Act on the user's message (or, failing that, on the review comments above).`;
}

/**
 * Variante SANS PR du message d'héritage : la lignée du ticket vit sur une branche
 * qui porte du travail poussé, mais aucune pull request n'a (encore) été ouverte —
 * la création de PR est une décision, plus un automatisme. Sans ce message, une
 * session froide recommencerait le ticket de zéro par-dessus du travail existant.
 */
export function buildInheritedBranchMessage(input: {
  repo: AgentRepoContext;
  /** Dernière réponse de la session précédente (sa seule mémoire du travail). */
  previousSummary?: string | null;
}): string {
  const { repo } = input;
  const summaryBlock = input.previousSummary?.trim()
    ? `\n\n## What the previous session did (its own summary)\n${cap(input.previousSummary.trim(), 4000)}`
    : "";

  return `# This ticket already carries work in progress
The working branch **${repo.workBranch}** already carries committed work from a previous session. No pull request exists yet — opening one (with \`create_pr\`) is still an open decision.

You are a FRESH session: you did NOT write that code and you have none of the previous conversation — only what follows. So do NOT start the ticket over. **First read the current state of the branch**: run \`git diff ${repo.defaultBranch}\` to see everything this branch already changed, then \`read_file\` what matters. Only then act. Keep working on the SAME branch — the harness pushes ${repo.workBranch} at each turn end.

(The clone is shallow: \`git diff ${repo.defaultBranch}\` works, but three-dot diffs and deep \`git log\` have no common history to walk — don't rely on them.)${summaryBlock}

Everything above is context. Act on the user's message.`;
}

/**
 * Message utilisateur de CONTEXTE : dépôt + ticket (description + plan). Volontai-
 * rement présenté comme du contexte — la demande réelle est le message utilisateur
 * qui suit (le prompt du lanceur, poussé à part par l'appelant). Les instructions
 * du dépôt (AGENTS.md/CLAUDE.md) sont aussi injectées à part, juste après.
 */
export function buildAgentContextMessage(input: {
  issue: AgentIssueContext;
  repo: AgentRepoContext;
  projectName?: string | null;
}): string {
  const { issue, repo } = input;
  const planBlock = issue.plan?.trim()
    ? `\n\n## Implementation plan (from the ticket)\n${issue.plan.trim()}`
    : "";
  const descBlock = issue.description?.trim()
    ? `\n\n## Ticket description\n${issue.description.trim()}`
    : "";

  return `Repository: **${repo.fullName}** — working branch **${repo.workBranch}** (based on **${repo.defaultBranch}**). The harness commits and pushes ${repo.workBranch} at the end of each of your turns.

# Ticket — ${issue.identifier}: ${issue.title}${input.projectName ? `\nProject: ${input.projectName}` : ""}${descBlock}${planBlock}

This ticket is the session's anchor and context. The user's messages drive the work; if none follows, the ticket itself is the request.`;
}
