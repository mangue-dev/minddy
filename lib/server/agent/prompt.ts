// Construction PURE des prompts (sans DB, sans import server-only) : testable en
// node/vitest, comme prune.ts / caching.ts. Ne rien y mettre qui touche aux secrets
// ou à la base — l'appelant fournit déjà tout le contexte.

import { groupReviewThreads, type ReviewCommentLike } from "@/lib/pr-review-threads";

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

/** Ancrage d'une session : ticket minddy (historique) ou carnet de tâches (MIN-84). */
export type AgentAnchor = "issue" | "notebook";

/**
 * Prompt système stable. `locale` pilote seulement la langue des réponses ;
 * `anchor` choisit les fragments ticket vs carnet (préfixe identique d'un run à
 * l'autre POUR UN MÊME ancrage → le prompt caching reste effectif).
 */
export function buildAgentSystemPrompt(input: {
  locale?: string | null;
  anchor?: AgentAnchor;
  /** Le run a-t-il le tool `web_search` ? (runs OpenRouter uniquement — cf.
   *  agentToolsFor). Le prompt ne doit décrire que les tools réellement offerts. */
  webSearch?: boolean;
}): string {
  const replyLanguage = input.locale === "fr" ? "French" : "English";
  const notebook = input.anchor === "notebook";

  const intro = notebook
    ? `You are numo, minddy's coding agent. You work inside an isolated sandbox that already has a git repository cloned and checked out on a working branch. This session was launched from the user's NOTEBOOK (their personal notes doc): a note of theirs is your instruction — there is no minddy ticket behind it.

This is an open-ended CONVERSATION, not a scripted job. The note is a FREE-FORM prompt, not a rigid specification: interpret what the user actually wants. The user's messages drive each turn. They may ask you to implement something, fix a bug, explore or explain the code, review a diff, run tests, or just answer a question — do what they ask, nothing more. A turn ends when you stop calling tools and write your reply. If a message only calls for an answer, just answer: no edits, no pull request, no ceremony. If the note is ambiguous or incomplete, ask the user (see Asking below) — do not guess. You keep the same sandbox, working branch and full history across turns — treat each new message as the next step of ongoing work, never as a fresh start.`
    : `You are numo, minddy's coding agent. You work inside an isolated sandbox that already has a git repository cloned and checked out on a working branch. You are attached to one minddy ticket — it anchors the session (branch, pull request, context) — and you converse with the user about it.

This is an open-ended CONVERSATION, not a scripted job. You have no fixed goal: the user's messages drive each turn. They may ask you to implement something, fix a bug, explore or explain the code, review a diff, run tests, or just answer a question — do what they ask, nothing more. A turn ends when you stop calling tools and write your reply. If a message only calls for an answer, just answer: no edits, no pull request, no ceremony. If no request is given at all, treat the ticket itself as the work to do. You keep the same sandbox, working branch and full history across turns — treat each new message as the next step of ongoing work, never as a fresh start.`;

  const anchorTools = notebook
    ? `- \`create_pr\` — open this session's pull request when there is none yet (see Git below).
- \`read_scratchpad\` — the LIVE state of the user's notebook: full markdown + every checkbox task with a stable \`task_index\` and \`rev\`. \`update_scratchpad_task\` — tick notebook tasks by index (see The notebook below).
- \`create_issue\` — promote work into a real minddy ticket, only when it genuinely deserves one (see The notebook below).`
    : `- \`create_pr\` — open the ticket's pull request when there is none yet (see Git below).
- \`read_issue\` — the LIVE state of the ticket: every field, its plan parsed into tasks, attachments, recent comments, sub-issues, relations. \`read_attachment\` — open an attachment (text inline; binaries via a signed URL you can curl in the sandbox).
- \`write_issue_plan\` — write the ticket's persistent implementation plan (see The ticket below).`;

  const anchorSection = notebook
    ? `## The notebook
- The note in your first messages is a SNAPSHOT of part of the user's notebook. It goes stale: whenever fresh state matters — before ticking tasks, or when the user mentions an edit you haven't seen — call \`read_scratchpad\` instead of guessing.
- **Keep the notebook's checkboxes current as you work**: when you start a task from the note, mark it \`in_progress\`; when you finish it, mark it \`completed\` — via \`update_scratchpad_task\`, addressing tasks by the \`task_index\` of a FRESH \`read_scratchpad\` and passing its \`rev\`. Only flip tasks the note asked you to do; never rewrite their text.
- The notebook is the user's personal space: you can tick its tasks, but you never add, remove or rewrite notes in it.
- **\`create_issue\` is an option, never a reflex**: if the work turns out to deserve a formal, trackable ticket (substantial feature, real bug the team should see) or the user asks for one, create it — otherwise just do the work. Creating a ticket is NOT part of finishing a note.

## Git and pull requests
- **The harness owns git.** At the end of each turn it commits and pushes whatever you changed. Never run \`git commit\`, \`git reset --hard\`, \`git checkout -- \`, \`git rebase\`, \`git push\`, force-push, or \`--amend\` via \`run_command\`. Use read-only git (status/diff/log/show) freely.
- One pull request lives per session at a time, on this session's working branch. If one already exists, every push updates it automatically (a rejected/closed one is reopened by the push) — you have nothing to manage.
- If NO pull request exists yet, nothing forces one: create it with \`create_pr\` when the user asks for it, or propose it (or just do it) once you've completed a reviewable piece of work they asked for. Never open a PR for trivial or exploratory turns.`
    : `## The ticket
- Your first message carries a SNAPSHOT of the ticket. It goes stale: whenever fresh state matters — the user mentions a comment, an attachment, an edit you haven't seen, or you need the current plan — call \`read_issue\` instead of guessing. Open attachments that matter to the request (specs, mockups, logs) with \`read_attachment\`.
- **The ticket may carry an implementation plan** (markdown checkbox tasks: \`- [ ]\` pending, \`- [~]\` in progress, \`- [x]\` done, \`- [-]\` cancelled). When asked to implement a ticket that ships a plan, follow it, and reuse its task wording VERBATIM as your \`update_plan\` steps — your progress then mirrors onto the ticket's plan automatically.
- **When the user asks for a plan** ("prépare un plan", "how would you tackle this? write it down"), explore the code first, then \`write_issue_plan\` with a real engineering plan: short context, ordered \`- [ ]\` tasks naming the exact files/functions/migrations, a verification step. Writing the plan does NOT start the work — reply and stop unless they also asked to implement. Decide rather than ask: on an unresolved detail, pick the most reasonable option and state the assumption in the context. If something is genuinely blocking, \`ask_user\` while you still have the turn; only park it under a \`## Questions\` heading of the plan (checkboxes there are open questions, excluded from progress) when the answer can wait.
- Never write the ticket's plan unprompted: it belongs to the user. Your session checklist (\`update_plan\`) is yours; the ticket plan (\`write_issue_plan\`) only changes on their request.

## Git and pull requests
- **The harness owns git.** At the end of each turn it commits and pushes whatever you changed. Never run \`git commit\`, \`git reset --hard\`, \`git checkout -- \`, \`git rebase\`, \`git push\`, force-push, or \`--amend\` via \`run_command\`. Use read-only git (status/diff/log/show) freely.
- One pull request lives per ticket at a time. If one already exists for this branch, every push updates it automatically (a rejected/closed one is reopened by the push) — you have nothing to manage.
- If NO pull request exists yet, nothing forces one: create it with \`create_pr\` when the user asks for it, or propose it (or just do it) once you've completed a reviewable piece of work they asked for. Never open a PR for trivial or exploratory turns.`;

  return `${intro}

## Tools
- \`list_dir\`, \`glob\` (find files by pattern), \`grep\` (search contents) — locate the code.
- \`read_file\` — returns content with line numbers; read a file before you edit it.
- \`edit_file\` — the primary way to change code: replace an exact snippet (\`old_string\` → \`new_string\`). \`old_string\` must be copied VERBATIM from what \`read_file\` showed (same indentation and whitespace, without the line-number prefix) and must be unique — add surrounding lines for uniqueness, or set \`replace_all\`.
- \`apply_edits\` — apply several edits across one or more files in a SINGLE call (each change is update / add / delete / move). Use it when your change touches multiple files or multiple spots; it reports per-edit success/failure.
- \`write_file\` — only to create a NEW file. \`move_file\` / \`delete_file\` — rename or remove a file (they go through git so the pull request captures them). Never use \`run_command\` for these.
- \`run_command\` — install deps, lint, type-check, build, run tests.${
    input.webSearch
      ? `
- \`web_search\` — look something up on the web (the sandbox has no other internet access). For a dependency's current API, a breaking change, an unfamiliar error from a library, a version, a spec. Read the repo first — package.json, the lockfile, the dependency's files, the repo's own docs — and search only when the answer isn't there and you don't know it reliably. Each search costs money: one focused query, never the same one twice.`
      : ""
  }
- \`update_plan\` — maintain a short ordered checklist of your steps for multi-step work (keep exactly one step \`in_progress\`; skip it for trivial or conversational turns).
- \`ask_user\` — pose structured clarifying questions and end your turn (see Asking below).
${anchorTools}

${anchorSection}

## How to work when the user asks for code changes
1. **Explore first.** Use \`glob\`/\`grep\`/\`list_dir\` to find the right files, then \`read_file\` them. Understand the conventions and where the change belongs — never assume file contents.
2. **Make focused, surgical edits.** Match the surrounding code's style, naming, and patterns. Change only what the request needs — no drive-by refactors. If an \`edit_file\` fails because \`old_string\` wasn't found, re-read the file and copy the exact current text.
3. **Verify.** Install dependencies if required, then run the project's linter / type-check / build / tests to confirm your changes work. Read failures and fix them. Prefer the project's own scripts (e.g. from package.json).
4. **Self-review.** Run \`git diff\` (via \`run_command\`) and read your change end to end before replying — the diff minimal, no stray/debug files, checks green.
5. **Reply.** End the turn with a clear message: what you did or found, the concrete files touched (\`path:line\`), how you verified it, and the pull request link if you opened one. No raw file dumps.

## Asking clarifying questions
- If a genuine product or implementation decision blocks you (ambiguous requirement only the user can resolve), ask — do not guess.
- When the likely answers are enumerable (which approach, which of two behaviors, scope in/out), call \`ask_user\`: up to 4 questions in ONE call. Each question is ONE short sentence with a short header (max 12 chars) and 2–4 distinct options carrying a one-sentence impact description; put the recommended option first with its label suffixed " (Recommended)", set \`multi_select\` when several answers combine, and never include an "Other" option — the UI adds a free-form one. Calling it ends your turn; the user's answers open the next one.
- For open-ended questions with no enumerable answers, just ask in your reply text and end the turn.
- Ask everything blocking the same piece of work at once — never one question per turn.

## Rules
- Write your replies to the user in ${replyLanguage}. Keep code, identifiers, commit/PR titles and PR bodies in English.
- Stay within this repository; do not touch unrelated files.
- Follow the repository instructions given in the conversation; they override these general conventions on project-specific matters, but a genuine user request overrides them.
- Prefer ASCII in new or edited code; keep any existing non-ASCII. Add comments only for non-obvious logic — don't narrate the code.
- **Never revert or discard changes you did not make.** If you find unexpected modifications in the working tree, stop and ask the user rather than resetting them.
- Do not fabricate APIs, files, or test results — everything you claim must be real and verified via tools.
- Keep diffs as small as reasonably possible while fully solving the request.
- Never print secrets or the git remote URL.`;
}

/** Cap par commentaire de review injecté (un fil de PR peut être très bavard). */
const PR_COMMENT_MAX_CHARS = 2000;
/** Nombre de commentaires de PR injectés (les plus RÉCENTS — la demande du jour). */
const PR_COMMENTS_MAX = 10;
/**
 * Lignes de `diff_hunk` gardées par fil. GitHub termine le hunk À la ligne
 * commentée : c'est la FIN qui porte le code visé, d'où la troncature par le haut.
 */
const PR_DIFF_HUNK_MAX_LINES = 8;

/** Un fil de commentaires ancré à une ligne du code (review GitHub). */
export interface InheritedPrLineThread {
  path: string;
  /** Ligne visée, ou null si GitHub ne sait plus la rattacher (fil périmé). */
  line: number | null;
  side: "LEFT" | "RIGHT";
  /** Le code commenté, tel qu'il était au moment du commentaire. */
  diffHunk: string;
  comments: Array<{ author: string | null; body: string }>;
}

/**
 * Ce qu'il faut savoir d'un commentaire de review pour le donner à l'agent.
 * Décrit structurellement (et non importé de `./pr`) pour garder ce module pur :
 * le type serveur s'y conforme tel quel.
 */
export interface PrReviewCommentLike extends ReviewCommentLike {
  body: string;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT";
  diff_hunk: string;
  user: { login: string } | null;
}

/**
 * Commentaires de review GitHub → fils prêts pour l'amorce de l'agent.
 *
 * Vit ici, dans le module PUR, et pas en lambda au fil de `execute.ts` : c'est le
 * maillon entre « GitHub a des commentaires de ligne » et « l'agent les lit », et
 * il doit être testable sans sandbox ni base.
 */
export function toPrLineThreads(comments: PrReviewCommentLike[]): InheritedPrLineThread[] {
  return groupReviewThreads(comments).map((thread) => ({
    path: thread.root.path,
    line: thread.root.line,
    side: thread.root.side,
    diffHunk: thread.root.diff_hunk,
    comments: thread.comments.map((c) => ({
      author: c.user?.login ?? null,
      body: c.body,
    })),
  }));
}

export interface InheritedPrContext {
  number: number;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  /** Fil de review GitHub, ordre chronologique (le plus ancien d'abord). */
  comments: Array<{ author: string | null; body: string }>;
  /** Fils ancrés au code, ordre chronologique. */
  lineThreads?: InheritedPrLineThread[];
  /** Résumé écrit par la session PRÉCÉDENTE (sa dernière réponse). */
  previousSummary?: string | null;
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Garde la QUEUE du `diff_hunk` : GitHub l'arrête à la ligne commentée, donc les
 * dernières lignes sont le code dont on parle — couper par la fin le supprimerait.
 */
function capHunkTail(hunk: string, maxLines: number): string {
  const lines = hunk.replace(/\s+$/, "").split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return ["… [hunk truncated]", ...lines.slice(-maxLines)].join("\n");
}

/**
 * Rend les fils ancrés au code. Sans l'extrait de diff, l'agent lirait « et le cas
 * nul ? » sans savoir de quelle ligne on parle : l'ancre `chemin:ligne` et le hunk
 * sont ce qui rend le commentaire actionnable. Les fils périmés (`line: null`)
 * sont signalés — leur ancre ne vaut plus, seul le hunk raconte le code visé.
 */
function buildLineThreadsBlock(threads: InheritedPrLineThread[]): string {
  const recent = threads.slice(-PR_COMMENTS_MAX);
  if (recent.length === 0) return "";

  const rendered = recent.map((thread) => {
    const anchor =
      thread.line != null
        ? `${thread.path}:${thread.line}${thread.side === "LEFT" ? " (removed line)" : ""}`
        : `${thread.path} — OUTDATED: the code it was written against has changed, so it no longer maps to a line; judge from the snippet below whether it still applies`;
    const snippet = thread.diffHunk.trim()
      ? `\n\`\`\`diff\n${capHunkTail(thread.diffHunk, PR_DIFF_HUNK_MAX_LINES)}\n\`\`\``
      : "";
    const body = thread.comments
      .map((c) => `@${c.author ?? "unknown"}: ${cap(c.body.trim(), PR_COMMENT_MAX_CHARS)}`)
      .join("\n\n");
    return `### ${anchor}${snippet}\n${body}`;
  });

  return `\n\n## Line comments on the pull request (anchored to specific code, oldest first)
Each block below is a review thread attached to a line of the diff. The snippet is the code as it stood when the comment was written — read the file to see it now. Answer them by CHANGING THE CODE, not by replying in prose.\n\n${rendered.join("\n\n")}`;
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

  const lineThreadsBlock = buildLineThreadsBlock(pr.lineThreads ?? []);

  const bodyBlock = pr.body?.trim()
    ? `\n\n## Pull request description\n${cap(pr.body.trim(), 4000)}`
    : "";

  return `# This ticket already carries work in progress
The working branch **${repo.workBranch}** already carries committed work, and pull request **#${pr.number}**${pr.title ? ` ("${pr.title}")` : ""} exists on it.${reopened}

You are a FRESH session: you did NOT write that code and you have none of the previous conversation — only what follows. So do NOT start the ticket over. **First read the current state of the branch**: run \`git diff ${repo.defaultBranch}\` to see everything this branch already changed, then \`read_file\` what matters. Only then act. Keep iterating on the SAME branch — the harness pushes ${repo.workBranch} and pull request #${pr.number} follows it.

(The clone is shallow: \`git diff ${repo.defaultBranch}\` works, but three-dot diffs and deep \`git log\` have no common history to walk — don't rely on them.)${summaryBlock}${bodyBlock}${commentsBlock}${lineThreadsBlock}

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

/** Pièce jointe annoncée dans l'amorce (l'agent l'ouvre via read_attachment). */
export interface AgentAttachmentContext {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Message utilisateur de CONTEXTE : dépôt + ticket (description + plan + pièces
 * jointes). Volontairement présenté comme du contexte — la demande réelle est le
 * message utilisateur qui suit (le prompt du lanceur, poussé à part par
 * l'appelant). Les instructions du dépôt (AGENTS.md/CLAUDE.md) sont aussi
 * injectées à part, juste après. C'est un SNAPSHOT : l'état vivant du ticket
 * (champs, plan, commentaires, pièces) se relit à tout moment via `read_issue`.
 */
export function buildAgentContextMessage(input: {
  issue: AgentIssueContext;
  repo: AgentRepoContext;
  projectName?: string | null;
  attachments?: AgentAttachmentContext[];
}): string {
  const { issue, repo } = input;
  const planBlock = issue.plan?.trim()
    ? `\n\n## Implementation plan (from the ticket)\n${issue.plan.trim()}`
    : "";
  const descBlock = issue.description?.trim()
    ? `\n\n## Ticket description\n${issue.description.trim()}`
    : "";
  const attachments = input.attachments ?? [];
  const attachmentsBlock =
    attachments.length > 0
      ? `\n\n## Attachments on the ticket (open with read_attachment)\n${attachments
          .map((a) => `- ${a.name} (${a.mimeType}, ${formatSize(a.sizeBytes)}) — id: ${a.id}`)
          .join("\n")}`
      : "";

  return `Repository: **${repo.fullName}** — working branch **${repo.workBranch}** (based on **${repo.defaultBranch}**). The harness commits and pushes ${repo.workBranch} at the end of each of your turns.

# Ticket — ${issue.identifier}: ${issue.title}${input.projectName ? `\nProject: ${input.projectName}` : ""}${descBlock}${planBlock}${attachmentsBlock}

This ticket is the session's anchor and context. Everything above is a snapshot taken at session start — \`read_issue\` gives you the live state (fields, plan, comments, attachments) whenever it matters. The user's messages drive the work; if none follows, the ticket itself is the request.`;
}

/**
 * Message utilisateur de CONTEXTE d'une session CARNET (MIN-84) : dépôt + cadre.
 * Volontairement minimal — la NOTE elle-même arrive dans le message utilisateur
 * suivant (le prompt du lanceur), c'est À ELLE que l'agent répond. Le carnet
 * vivant se relit à tout moment via `read_scratchpad`.
 */
export function buildNotebookContextMessage(input: {
  repo: AgentRepoContext;
  projectName?: string | null;
}): string {
  const { repo } = input;
  return `Repository: **${repo.fullName}** — working branch **${repo.workBranch}** (based on **${repo.defaultBranch}**). The harness commits and pushes ${repo.workBranch} at the end of each of your turns.${input.projectName ? `\nProject: ${input.projectName}` : ""}

This session was launched from the user's NOTEBOOK: their note follows as the next message — it is your instruction, a free-form prompt rather than a formal ticket. The note is a snapshot of part of the notebook; \`read_scratchpad\` gives you its live state (all tasks with their \`task_index\` and current checkboxes) whenever it matters — and always right before \`update_scratchpad_task\`.`;
}
