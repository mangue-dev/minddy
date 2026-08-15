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
 * L'ANCRAGE MINDDY SERVI À OPENCODE (MIN-286) — le texte que le superviseur écrit
 * dans `OPENCODE_ANCHOR_FILE` et qu'opencode ajoute à SON prompt système
 * (`instructions`, mesuré : le contenu du fichier atterrit dans le message système,
 * docs/harness-opencode.md §2.8).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DIT, ET CE QU'IL NE REDIT PAS
 *
 * Le prompt d'opencode décrit DÉJÀ ses tools de fichier et son shell : les
 * redécrire ici, moins bien, c'est se contredire dans le même message système. Ce
 * document ne porte donc que ce qu'opencode ne peut pas savoir :
 *
 *  1. **qui l'agent est** dans minddy, et à quoi cette session est ancrée
 *     (ticket / carnet / relecture) ;
 *  2. **les 32 tools de domaine** et leur doctrine (le plan du ticket appartient à
 *     l'utilisateur, un statut ne s'écrit jamais, une remarque de PR est rationnée) ;
 *  3. **ce que le HARNESS impose à ses tools à lui** : git nous appartient et le
 *     shell refuse ce qui détruit du travail, la recherche web est la nôtre et
 *     plafonnée, une question TERMINE le tour, la porte de livraison du premier
 *     `create_pr`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST LE MÊME TEXTE QUE LA BOUCLE MAISON
 *
 * Tout ce qui est doctrine de produit vient des fragments partagés de
 * [prompt.ts](prompt.ts) — la table `PromptToolNames` étant la seule chose qui
 * varie. Une copie aurait divergé au premier ajustement, et la divergence se
 * serait lue dans le comportement des runs sans que personne ne sache pourquoi :
 * c'est exactement ce que la semaine de bascule doit pouvoir écarter (« mêmes
 * events, même ordre, mêmes coûts »).
 *
 * Ce qui est écrit ICI et nulle part ailleurs est ce que la MESURE a rendu
 * différent chez opencode, et rien d'autre :
 *  - `task` **bloque** le parent tant que la fille n'a pas rapporté (§2.14, faute
 *    d'`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`) — donc « tu n'attends jamais,
 *    tu ne sondes jamais » devient faux, et le dire faux ferait attendre le modèle
 *    devant un tool qui a déjà rendu ;
 *  - le modèle d'une fille est porté par le NOM de l'agent (`explore-<slug>`), pas
 *    par un argument ;
 *  - il n'y a pas d'édition par LOT (§3.2) ;
 *  - `run_background` est un tool de NOUS, pas d'opencode : son `bash` n'a pas de
 *    mode fond, donc le harnais le repose et le décrit (§3.2, lot 3).
 */

export interface OpencodeAnchorInput {
  locale?: string | null;
  anchor?: AgentAnchor;
  /** Faux pour un passage de ROUTINE : pas de `question`, et le mandat de PR. */
  interactive?: boolean;
  webSearch?: boolean;
  webSearchMax?: number;
  chain?: boolean;
  images?: boolean;
  /**
   * LE TOUR JOUE-T-IL DANS LE CHECKOUT DE L'UTILISATEUR (MIN-358) ?
   *
   * Trois lignes du bloc git deviennent fausses en mode dépôt courant, et
   * chacune coûte du travail humain quand elle n'est pas dite : le dépôt n'est
   * plus jetable, `git status` n'est plus le diff du modèle, et l'historique
   * n'est plus une fenêtre de six mois (cf. `gitOwnershipBlock`).
   */
  currentRepo?: boolean;
  /** La délégation est-elle offerte, et sur quels modèles ? Absent = pas de `task`. */
  subagents?: {
    favorites: Array<FavoriteSubagentModel & { multiplier?: number }>;
    models: boolean;
    maxMultiplier?: number | null;
  };
}

const n = OPENCODE_TOOL_NAMES;

/**
 * CE QUE LE HARNESS CHANGE AUX TOOLS D'OPENCODE. Uniquement des écarts : chaque
 * ligne existe parce qu'un modèle qui ne la lit pas se trompe pour de vrai — il
 * tente un `git commit` (refusé), il cherche une édition par lot (inexistante), il
 * attend une réponse après une question (le tour est fini), ou il appelle le
 * `websearch` d'opencode (éteint, et hors de nos compteurs).
 */
function harnessDeltas(input: OpencodeAnchorInput): string {
  const routine = input.interactive === false;
  const lines = [
    // La liste des refus est celle de `command-guard`, et elle N'EST PAS la même
    // des deux côtés depuis D6 : `git commit` est rendu au modèle en mode dépôt
    // courant. La redire ici sans le scope ferait dire au harnais l'inverse de ce
    // qu'il exécute — le défaut du §1 de l'audit, une ligne plus bas.
    input.currentRepo === true
      ? `- **Your shell enforces what git may not do here.** ${GIT_REFUSALS_CURRENT_REPO(n)} See Git and pull requests below for who delivers.`
      : `- **The harness owns git, and your shell enforces it.** \`${n.shell}\` REFUSES the commands that would destroy work or fight it — \`git commit\`, \`git push\`, \`git reset\`, \`git restore\`, \`git checkout -- <file>\`, \`git rebase\`, \`git cherry-pick\`, \`git stash drop/clear\`, \`git clean -f\`, \`--amend\` — and the call comes back as an error, wrapped in \`bash -c\` included. Read-only git and \`git add\` are free. See Git and pull requests below for what happens instead.`,
    `- ${shellOutputNote(n)}`,
    `- **To rename or remove a file, use \`${n.shell}\`** (\`mv\`, \`rm\`): the end-of-turn commit picks them up like any other change.`,
    `- **There is no batch-edit tool.** One \`edit\` call changes one place; chain them rather than looking for a multi-edit. Read the file before editing it, and copy \`oldString\` verbatim from what \`${n.read}\` showed.`,
    `- ${grepPatternNote()}`,
    // `bash` n'a pas de mode fond : ce tool-là vient de nous, donc le prompt
    // d'opencode n'en dit rien et c'est ici qu'il se décrit.
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
      // MIN-364 (D7) : la question BLOQUE sur la machine de l'utilisateur, et il
      // n'y a rien à faire pour ça — le tool d'opencode bloque déjà tout seul.
      // Lui dire l'inverse le ferait tout finir avant de demander, et lire son
      // propre tour comme perdu au moment où il demande.
      input.currentRepo === true
        ? `- **\`${n.ask}\` SUSPENDS your turn — it does not end it.** The call blocks, the user answers, and their answer comes back to you as the tool's own result: you keep your context, your plan and your open files. Ask the moment the answer changes what you would write, and put everything blocking the same piece of work in ONE call.`
        : `- **\`${n.ask}\` ENDS your turn.** It is not a blocking prompt: the questions go to the user, the session goes to sleep, and their answers open your next turn. So ask everything blocking the same piece of work in ONE call, and never call it for something you can decide yourself.`,
    );
  }
  return `## What minddy's harness changes about your tools
${lines.join("\n")}`;
}

/**
 * La délégation chez opencode : le tool `task`, un agent par (mode × modèle).
 *
 * La doctrine est celle de MIN-112 — déléguer ce qui est large mais dont la
 * conclusion est courte, ne pas déléguer ce qui tient en deux appels, un seul
 * écrivain, le rapport comme unique livrable. Ce qui change, et c'est mesuré : le
 * tool **bloque**, il n'y a donc ni sondage ni réveil, et le modèle de la fille se
 * choisit en choisissant son `subagent_type`.
 */
function delegationSection(input: OpencodeAnchorInput): string {
  const subs = input.subagents;
  if (!subs) return "";
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
- **One writer at a time.** \`explore\` types are read-only and parallelise freely. A \`general\` type edits the repository, so while one is in flight your own editing tools are refused and so is \`create_pr\` — the sandbox is shared, and the harness commits everything it finds at the end of the turn, half-written work included.
- **The report is all you get back.** The child cannot ask you anything and you cannot ask it a follow-up, so write \`prompt\` as a complete briefing — what to do, where (paths, symbols), what not to touch, and the exact shape of the answer you need. When a claim from a report matters, check it in the repository yourself.
- It has none of your context: not this conversation, not the ticket, not the notebook, not the pull request — and it cannot delegate further.${modelsNote}`;
}

/**
 * L'ancrage complet d'un tour. Une session de RELECTURE garde sa persona à elle
 * (MIN-168) : ni édition, ni git, ni pull request à ouvrir — servir l'ancrage du
 * dessous amputé lui ferait promettre des gestes qu'elle ne peut pas faire.
 */
export function buildOpencodeAnchor(input: OpencodeAnchorInput): string {
  if (input.anchor === "pr") {
    return buildPrReviewSystemPrompt({ locale: input.locale, images: input.images, n });
  }
  const routine = input.interactive === false;
  const notebook = input.anchor === "notebook";
  const replyLanguage = input.locale === "fr" ? "French" : "English";
  const anchorTools = notebook
    ? `- \`create_pr\` — open this session's pull request when there is none yet (see Git below).`
    : `- \`create_pr\` — open the ticket's pull request when there is none yet (see Git below).`;
  const chainTool = input.chain
    ? `
- \`report_verdict\` — close this run with its VERDICT, because it is a step of an automated chain (see below).`
    : "";
  return `${introBlock({ notebook, routine })}

${harnessDeltas(input)}

## minddy's own tools
${anchorTools}${chainTool}
${minddyToolsBlock({ images: input.images === true, routine })}

${anchorRulesSection({ notebook, routine, n, currentRepo: input.currentRepo === true })}${projectPrSection(routine)}${delegationSection(input)}

${workflowSteps({
  routine,
  n,
  // L'édition d'opencode est la nôtre, à un nom près : `edit.ts` est emprunté à
  // opencode (docs §3.1), donc le conseil sur un `oldString` introuvable vaut mot
  // pour mot — seul le nom du tool change.
  failedEditAdvice: `If an \`edit\` fails because \`oldString\` wasn't found, re-read the file and copy the exact current text.`,
})}

${askingSection({ routine, n, currentRepo: input.currentRepo === true })}${chainSection(input.chain === true)}${untrustedContentSection({ notebook })}${rulesTail(replyLanguage, input.currentRepo === true)}`;
}

/**
 * Garde-fou de la table de noms : aucun nom de la boucle maison ne doit survivre
 * dans l'ancrage servi à opencode. Exporté pour que le test le rejoue sur toutes
 * les variantes plutôt que sur une seule.
 */
export const LEGACY_TOOL_NAMES = [
  LOOP_TOOL_NAMES.read,
  LOOP_TOOL_NAMES.list,
  LOOP_TOOL_NAMES.shell,
  // `background` n'est PAS dans cette liste : depuis le lot 3, `run_background`
  // est servi par les deux moteurs sous le même nom (le harnais le repose dans la
  // microVM), il ne trahit donc plus une copie du prompt de la boucle maison.
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
