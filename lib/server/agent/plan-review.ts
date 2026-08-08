import { headTail } from "./prune";
import { REPO_DIR, sq, type RepoHost } from "./repo-host";

/**
 * AUTO-RELECTURE D'UN PLAN (MIN-237) — le pendant, pour un document, de ce que
 * `self-review.ts` fait pour un diff.
 *
 * Un tour qui modifie des fichiers reçoit deux choses avant de rendre la main :
 * les erreurs de typage (`diagnostics.ts`) et son propre diff à relire de bout en
 * bout (`self-review.ts`). Un tour `intent: plan` ne change aucun fichier, donc
 * les deux se taisent : il écrit son document et répond. C'est la SEULE sortie de
 * l'agent qui n'a aucun moment de relecture, alors que c'est celle sur laquelle
 * quelqu'un va ensuite construire.
 *
 * Ce que ça a coûté, mesuré sur le run `ada40ec9` (MIN-226) : une tâche
 * « vérifier `components/secondary-sidebar.tsx` » écrite sur un fichier que le run
 * avait lu TROIS FOIS sans rien y trouver à changer ; un `loading.tsx` ouvert et
 * jamais repris en tâche ; et une étape de vérification qui promettait
 * `npm run lint`, script qui n'existe pas dans ce dépôt — `package.json` n'ayant
 * jamais été ouvert.
 *
 * De ces trois défauts, UN SEUL est mécaniquement décidable, et c'est celui-là que
 * le harness tranche : les commandes que le plan nomme sont confrontées aux
 * `scripts` du `package.json` du dépôt. Les deux autres tiennent à ce que le
 * modèle sait de son PROPRE tour — quels fichiers il a ouverts, quelle question il
 * a déjà résolue — et le harness n'en sait rien. Ils restent donc des QUESTIONS,
 * posées au moment où elles peuvent encore servir : avant la réponse.
 *
 * Jumeau de `plan-closure.ts` (MIN-236), qui attaque le même trou par la
 * complétude plutôt que par la relecture. Les deux sont utiles séparément, et sur
 * un tour de plan ils se servent l'un après l'autre — cf. l'ordre de la chaîne
 * `onTurnEnd` dans execute.ts.
 */

/** Budget mural minimum restant pour servir la relecture. Même seuil que la
 *  clôture : on ne lance rien de coûteux (une lecture de manifeste), mais il faut
 *  laisser au modèle de quoi relire son plan et le corriger. */
export const PLAN_REVIEW_MIN_BUDGET_MS = 45_000;
/** Budget mural de la sonde `package.json`. Large pour un `head` sur un fichier. */
export const PLAN_REVIEW_TIMEOUT_MS = 15_000;
/**
 * Cap du plan réinjecté. Élision par le MILIEU (`headTail`), comme le diff : le
 * contexte est en tête, l'étape de vérification en queue, et ce sont les deux
 * bouts que les questions interrogent. Un plan de plus de 12 000 caractères est
 * de toute façon un plan que personne ne relira d'une traite.
 */
export const PLAN_REVIEW_MAX_CHARS = 12_000;

/** Scripts listés dans le bloc (au-delà, on dit combien il en reste). */
const SCRIPTS_SHOWN = 24;
/** Commandes manquantes listées (au-delà, le plan a un autre problème). */
const MISSING_SHOWN = 6;
/** Cap de lecture du manifeste. Un `package.json` est un manifeste ; ce cap ne
 *  borne qu'un dépôt pathologique, où la sonde se taira faute de JSON valide. */
const PKG_MAX_BYTES = 131_072;
/** Séparateur des deux moitiés de la sonde. Sur sa propre ligne, il ne peut pas
 *  apparaître dans le JSON : une chaîne JSON ne contient pas de saut de ligne nu. */
const WORKSPACE_MARK = "@@workspace";

/** Ce que le dépôt sait dire de ses commandes. */
export interface RepoScripts {
  /** Les noms de `scripts` du `package.json` RACINE, dans l'ordre du fichier. */
  names: string[];
  /**
   * Le dépôt a-t-il l'air d'un monorepo (`workspaces`, `pnpm-workspace.yaml`) ?
   *
   * Ce drapeau ne sert qu'à SE TAIRE : dans un monorepo, un script absent de la
   * racine peut très bien vivre dans un paquet, et le harness n'a aucun moyen de
   * trancher. Il liste alors ce qu'il connaît au lieu d'accuser — une observation
   * fausse coûte bien plus cher que l'observation qu'on n'a pas faite.
   */
  workspace: boolean;
}

// ── Ce que le plan promet ────────────────────────────────────────────────────

/**
 * Un script de `package.json` invoqué par un gestionnaire de paquets.
 *
 * Seules les formes EXPLICITES (`npm run x`, `pnpm run x`, `yarn run x`) sont
 * lues : `pnpm x` tout court est ambigu — `pnpm add`, `pnpm dlx`, `pnpm install`
 * ne sont pas des scripts, et se tromper ici ferait dire au harness qu'un script
 * manque là où il n'y en a jamais eu.
 */
const RUN_SCRIPT = /\b(?:npm|pnpm|yarn|bun)\s+(?:run|run-script)\s+([A-Za-z0-9:@._/-]+)/g;
/** `npm test` est le seul raccourci qui vise vraiment un script du manifeste (et
 *  qui échoue bruyamment s'il manque). `npm start`, lui, retombe sur `server.js`. */
const NPM_TEST = /\bnpm\s+test\b/;

/**
 * Les scripts que le plan promet de lancer, dans l'ordre du document.
 *
 * Les blocs de code sont LUS ici, contrairement à `planNeedles` (plan-closure.ts)
 * qui les jette : là-bas un bloc est un extrait de code à écrire, ici c'est
 * l'endroit même où l'étape de vérification écrit ses commandes.
 */
export function planCommands(plan: string): string[] {
  const out: string[] = [];
  const push = (name: string): void => {
    // `npm run -- --flag` : un drapeau n'est pas un nom de script.
    if (!name || name.startsWith("-") || out.includes(name)) return;
    out.push(name);
  };
  for (const m of plan.matchAll(RUN_SCRIPT)) push(m[1]);
  if (NPM_TEST.test(plan)) push("test");
  return out;
}

// ── Ce que le dépôt offre ────────────────────────────────────────────────────

/**
 * UNE commande pour les deux moitiés de la sonde : le manifeste racine, puis la
 * présence d'un fichier d'espace de travail pnpm. Un `host.exec` par question
 * coûterait un aller-retour réseau chacun depuis la fonction (le moteur hors
 * microVM parle à la sandbox par le réseau).
 */
export function buildScriptsCommand(): string {
  return `head -c ${PKG_MAX_BYTES} package.json 2>/dev/null || true; printf '\\n%s\\n' ${sq(WORKSPACE_MARK)}; ls pnpm-workspace.yaml pnpm-workspace.yml 2>/dev/null || true`;
}

/** Relit la sonde, ou `null` si le dépôt n'a pas de manifeste lisible — auquel cas
 *  la question des commandes reste une question, sans réponse du harness. */
export function parseScriptsProbe(stdout: string): RepoScripts | null {
  const at = stdout.lastIndexOf(`\n${WORKSPACE_MARK}\n`);
  const json = at >= 0 ? stdout.slice(0, at) : stdout;
  const tail = at >= 0 ? stdout.slice(at + WORKSPACE_MARK.length + 2) : "";

  let pkg: unknown;
  try {
    pkg = JSON.parse(json);
  } catch {
    return null;
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return null;

  const scripts = (pkg as { scripts?: unknown }).scripts;
  const names =
    scripts && typeof scripts === "object" && !Array.isArray(scripts)
      ? Object.keys(scripts as Record<string, unknown>)
      : [];
  return {
    names,
    workspace: (pkg as { workspaces?: unknown }).workspaces != null || tail.trim().length > 0,
  };
}

// ── Le bloc servi au modèle ──────────────────────────────────────────────────

const HEADER = `Before you reply: here is the plan you just wrote, read back to you. Nothing else in this turn re-reads it, and someone is going to build on it.`;

const QUESTIONS = `Read it as its reader will — with your plan and none of your context:
- does every task name code you actually opened this turn? A path you inferred but never read is a guess, and a plan is read as a statement of fact.
- does a task say "check whether X" or "verify X" where you already know the answer? You looked — write the finding, not the errand. A task that re-asks a question you already answered makes the next run redo your work.
- does the verification step name commands that exist in this repo?
- did you open a file this turn that no task mentions? Decide which it is: it belongs in the plan, or it does not.`;

const FOOTER = `Fix what needs fixing IN PLACE: \`edit_issue_text\` rewrites one passage (old_string → new_string), \`append_to_plan\` adds a task or a note. Do NOT call \`write_issue_plan\` again — it re-emits the whole document and would drop anything changed meanwhile. If the plan holds up, just reply: do not restate it.`;

/** `\`a\`, \`b\`, \`c\`.` — la liste des scripts, capée. */
function scriptList(names: readonly string[]): string {
  const shown = names.slice(0, SCRIPTS_SHOWN);
  const hidden = names.length - shown.length;
  return `${shown.map((n) => `\`${n}\``).join(", ")}${hidden > 0 ? `, … and ${hidden} more` : ""}.`;
}

/**
 * La clôture qui encadre le plan sans qu'il la referme.
 *
 * Un plan contient des blocs de code — l'étape de vérification en est un, et
 * c'est justement celui que les questions interrogent. Une clôture à trois
 * backticks serait donc REFERMÉE par le plan lui-même, et tout ce qui suit le
 * premier bloc (le reste du plan, le verdict, les questions) se lirait comme du
 * code. La règle CommonMark : une clôture plus longue que la plus longue qu'elle
 * contient.
 */
function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Ce que le harness a à dire des commandes du plan, ou `""` s'il n'a rien à en
 * dire. Quatre cas, et le silence en fait partie : sans manifeste lisible, la
 * question reste posée au modèle sans réponse — mieux vaut ça qu'une réponse
 * inventée.
 */
function commandsVerdict(named: readonly string[], scripts: RepoScripts | null): string {
  if (!scripts) return "";

  // Monorepo : un script absent de la racine peut vivre dans un paquet. On liste,
  // on n'accuse pas.
  if (scripts.workspace) {
    if (scripts.names.length === 0) return "";
    return `This repo's root \`package.json\` declares workspaces, so the harness cannot tell where a script lives. Its ROOT scripts are: ${scriptList(scripts.names)}`;
  }

  const missing = named.filter((name) => !scripts.names.includes(name));
  if (missing.length > 0) {
    const shown = missing.slice(0, MISSING_SHOWN);
    const hidden = missing.length - shown.length;
    const list = shown.map((name) => `- \`npm run ${name}\` — there is no \`${name}\` script.`);
    return `The harness read the repo's \`package.json\`. Your plan promises commands that do not exist:\n${list.join("\n")}${
      hidden > 0 ? `\n… and ${hidden} more.` : ""
    }\n\nThe scripts this repo actually has: ${
      scripts.names.length > 0 ? scriptList(scripts.names) : "none at all."
    }`;
  }

  if (named.length > 0) {
    return `The harness read the repo's \`package.json\`: every command your plan names exists there. Nothing to fix on that one.`;
  }

  if (scripts.names.length === 0) return "";
  return `Your plan names no command to run. The repo's \`package.json\` offers: ${scriptList(scripts.names)}`;
}

/**
 * Le bloc de relecture, ou `null` s'il n'y a pas de plan à relire.
 *
 * Toujours servi quand un plan a été écrit, là où `formatPlanClosure` se tait
 * quand elle n'a rien trouvé : la clôture est une OBSERVATION (pas d'observation,
 * pas de bloc), la relecture est un MOMENT — celui qui manquait. Un diff correct
 * revient lui aussi au modèle.
 *
 * PUR : la sandbox est lue par l'appelant, comme `formatTypeErrors` et
 * `formatSelfReview`, pour que les caps et la formulation se testent sans microVM.
 */
export function formatPlanReview(input: {
  /** Le markdown du plan écrit ce tour (appends et corrections du même tour compris). */
  plan: string;
  /** Ce que la sonde a rendu, ou `null` si le dépôt n'a pas de manifeste lisible. */
  scripts?: RepoScripts | null;
}): string | null {
  const plan = input.plan.trim();
  if (!plan) return null;

  const verdict = commandsVerdict(planCommands(plan), input.scripts ?? null);
  const shown = headTail(plan, PLAN_REVIEW_MAX_CHARS);
  const fence = fenceFor(shown);
  return [
    HEADER,
    `${fence}markdown\n${shown}\n${fence}`,
    ...(verdict ? [verdict] : []),
    QUESTIONS,
    FOOTER,
  ].join("\n\n");
}

// ── Le crochet impur ─────────────────────────────────────────────────────────

/**
 * Sonde le dépôt et rend le bloc de relecture, ou `null` si le plan est vide.
 *
 * La sonde est best-effort — pas de dépôt, pas de `package.json`, JSON illisible,
 * timeout → le bloc part SANS le verdict sur les commandes. Ce n'est pas une
 * dégradation silencieuse : la question des commandes est écrite dans le bloc, et
 * elle redevient simplement une question que le modèle doit trancher lui-même.
 */
export async function planReviewForTurn(host: RepoHost, plan: string): Promise<string | null> {
  let scripts: RepoScripts | null = null;
  try {
    const res = await host.exec(buildScriptsCommand(), {
      cwd: REPO_DIR,
      timeoutMs: PLAN_REVIEW_TIMEOUT_MS,
    });
    if (res.exitCode === 0) scripts = parseScriptsProbe(res.stdout);
  } catch {
    // La relecture vaut d'être servie sans son verdict.
  }
  return formatPlanReview({ plan, scripts });
}
