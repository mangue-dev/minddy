import { REPO_DIR, sq, type RepoHost } from "./repo-host";
import type { PlatformToolHandler } from "./exec-tool";

/**
 * Contrôle de CLÔTURE d'un plan (MIN-236) — le harness pose la question à la
 * place du modèle, après `write_issue_plan` et avant qu'il ne rende la main.
 *
 * Le défaut visé n'est pas l'exploration : sur le run qui a coûté MIN-226, le
 * DERNIER appel avant l'écriture était un `grep ObjectiveSidePanel` qui rendait
 * les 4 fichiers en clair, et le plan n'en a nommé que 2. L'information était en
 * contexte. MIN-226 a refermé les deux causes mécaniques (le `grep` qui mentait,
 * la règle de clôture du prompt) ; celle-ci ne se referme pas par une consigne,
 * parce qu'un plan incomplet se lit exactement comme un plan complet — c'est
 * précisément ce qui le rend invisible à sa propre relecture.
 *
 * D'où la même doctrine que le type-check de fin de tour (`diagnostics.ts`) et
 * l'auto-relecture du diff (`self-review.ts`) : ce que le prompt DEMANDE, le
 * harness l'EXÉCUTE, et remet le résultat dans le contexte. Ici : les
 * identifiants que le plan nomme sont grepés pour de vrai, et les fichiers qui
 * les contiennent sans être nommés reviennent au modèle.
 *
 * **Une observation, pas un verdict.** Le harness ne sait pas distinguer un
 * appelant oublié d'une omission délibérée — un fichier de test qui cite le
 * composant sans être concerné par le changement est un cas parfaitement normal.
 * Il constate, le modèle tranche (`append_to_plan`, ou rien).
 *
 * Tout est MÉCANIQUE : aucune lecture sémantique du plan, aucun appel de modèle.
 * Extraire des tokens, les grep, soustraire ce que le plan nomme déjà.
 */

/** Budget mural du grep de clôture. Une seule commande, capée large : sur un gros
 *  dépôt `git grep -F` reste en dessous de la seconde par motif. */
export const PLAN_CLOSURE_TIMEOUT_MS = 60_000;
/** Budget minimum restant sur le chunk pour lancer le contrôle. Plus bas que le
 *  type-check (un `git grep` ne coûte rien), mais il faut laisser au modèle de
 *  quoi lire les fichiers rendus et compléter son plan. */
export const PLAN_CLOSURE_MIN_BUDGET_MS = 45_000;

/** Motifs grepés au maximum. Au-delà, on paie une commande de plus pour un signal
 *  que le modèle ne lira pas : les identifiants d'un plan sont ordonnés, les
 *  premiers portent le changement. */
export const MAX_NEEDLES = 12;
/**
 * Au-delà de ce nombre de fichiers, un motif est JETÉ plutôt que rapporté.
 *
 * C'est le garde-fou qui décide de l'utilité de tout le mécanisme. Un symbole
 * présent dans 40 fichiers est un utilitaire commun, pas un appelant oublié : le
 * rapporter noierait le seul motif qui compte sous ceux dont le plan n'avait
 * aucune raison de parler. Le cas fondateur tient largement dessous (4 fichiers).
 */
export const MAX_FILES_PER_NEEDLE = 12;
/** Fichiers listés par motif dans le bloc rendu. */
const FILES_SHOWN_PER_NEEDLE = 8;
/** Motifs listés dans le bloc rendu. */
const NEEDLES_SHOWN = 6;

/** Marqueur de groupe dans la sortie de la commande — un préfixe qu'aucun chemin
 *  de fichier ne porte, donc le découpage est sans ambiguïté. */
const GROUP_MARK = "@@needle ";

/** Un motif grepé et les fichiers du dépôt qui le contiennent. */
export interface ClosureHit {
  /** Le motif tel qu'il a été grepé (littéral). */
  needle: string;
  /** Le token du plan dont il vient — identique au motif sauf pour un chemin,
   *  dont on grep le basename sans extension. */
  source: string;
  /** Chemins relatifs au dépôt, tels que `git grep -l` les rend. */
  files: string[];
}

// ── Extraction ───────────────────────────────────────────────────────────────

/** Blocs de code fencés : leur contenu est un EXEMPLE, pas la liste de courses du
 *  plan. Les garder ferait grep chaque identifiant d'un extrait collé. */
const FENCE_BLOCK = /^```[\s\S]*?^```/gm;
/** Span de code inline — la convention du plan pour ses identifiants. */
const INLINE_CODE = /`([^`\n]+)`/g;
/** Chemin nu (hors backticks) : `lib/server/agent/execute.ts`. Un plan les écrit
 *  souvent sans les baliser, et ce sont eux qui portent le plus d'information. */
const BARE_PATH = /(?:^|[\s(,;:])((?:[\w.@\-[\]()]+\/)+[\w.@\-[\]()]+\.[A-Za-z0-9]+)/g;

/** Identifiant de code : PascalCase, camelCase, ou SCREAMING_SNAKE_CASE. Un token
 *  tout en minuscules (`plan`, `grep`, `objectif`) est un mot, pas un symbole. */
const PASCAL_OR_CAMEL = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/** Chemin de fichier : au moins un `/` et une extension. */
const PATH_LIKE = /^[\w.@\-[\]()/]+\.[A-Za-z0-9]+$/;

/**
 * Ce nom de fichier (extensions ôtées) désigne-t-il quelque chose, ou est-ce un
 * mot ?
 *
 * MESURÉ sur ce dépôt : sans ce filtre, `lib/server/agent/execute.ts` donnait le
 * motif `execute` et `vm/turn.ts` le motif `turn` — deux mots anglais courants,
 * ramenant l'un plus de cent fichiers et l'autre autant, tous jetés ensuite, après
 * avoir mangé deux des douze places de motifs. C'est la même règle que pour un
 * identifiant nu, appliquée au bon endroit : il faut une BOSSE (`objectiveSidePanel`)
 * ou un séparateur (`plan-closure`, `self_review`) pour qu'un nom soit un nom.
 *
 * Une liste de noms génériques (`page`, `route`, `index`, `middleware`…) faisait le
 * même travail en moins bien : il aurait fallu la tenir à jour à chaque convention
 * de framework, alors qu'aucun de ces noms ne passe cette règle-ci.
 */
function isDistinctiveStem(stem: string): boolean {
  if (stem.length < 4) return false;
  if (/[-_.]/.test(stem)) return true;
  return /^[a-z_$][A-Za-z0-9_$]*[A-Z]/.test(stem) || /^[A-Z][A-Za-z0-9_$]*[a-z]/.test(stem);
}

/** Le nom de fichier sans SES extensions : `plan-closure.test.ts` → `plan-closure`.
 *  Une seule passe laisserait `plan-closure.test`, qui ne trouve rien. */
function stemOf(basename: string): string {
  return basename.replace(/\.[A-Za-z0-9]+$/, "").replace(/\.(?:test|spec|stories|d)$/, "");
}

/**
 * Les motifs à grep, tirés du markdown du plan.
 *
 * Deux sources : les spans de code inline (la convention du plan) et les chemins
 * écrits sans backticks. Un chemin devient le motif « basename sans extension » —
 * `components/objectives/objective-side-panel.tsx` → `objective-side-panel` : ce
 * qu'on cherche, ce sont ses IMPORTATEURS, et un import ne cite jamais le chemin
 * complet tel que le plan l'écrit (`@/components/…`, `./objective-side-panel`).
 *
 * Ordre du document préservé, doublons retirés, cap à `MAX_NEEDLES`.
 */
export function planNeedles(plan: string): { needle: string; source: string }[] {
  const body = plan.replace(FENCE_BLOCK, "\n");
  const raw: string[] = [];
  for (const m of body.matchAll(INLINE_CODE)) raw.push(m[1].trim());
  for (const m of body.matchAll(BARE_PATH)) raw.push(m[1].trim());

  const out: { needle: string; source: string }[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    const needle = needleFor(token);
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    out.push({ needle, source: token });
    if (out.length >= MAX_NEEDLES) break;
  }
  return out;
}

/** Le motif que ce token vaut, ou `null` s'il n'a rien d'un symbole de code. */
function needleFor(token: string): string | null {
  // Une apostrophe casserait le quoting shell, un espace n'est jamais un symbole.
  if (!token || token.length > 80 || /[\s'\\`]/.test(token)) return null;

  if (token.includes("/")) {
    if (!PATH_LIKE.test(token)) return null;
    const stem = stemOf(token.slice(token.lastIndexOf("/") + 1));
    return isDistinctiveStem(stem) ? stem : null;
  }

  if (token.length < 4) return null;
  if (SCREAMING.test(token)) return token;
  if (!PASCAL_OR_CAMEL.test(token)) return null;
  // Une bosse au moins : c'est ce qui sépare `ObjectiveSidePanel` de `objectif`.
  return isDistinctiveStem(token) ? token : null;
}

// ── Le grep ──────────────────────────────────────────────────────────────────

/**
 * UNE commande pour tous les motifs. Un `host.exec` par motif coûterait un
 * aller-retour réseau chacun depuis la fonction (le moteur hors microVM parle à
 * la sandbox par le réseau) ; la boucle `sh` en coûte un pour tous.
 *
 * Chaque groupe s'ouvre sur `@@needle <motif>`, puis liste ses fichiers, un par
 * ligne — pas de `sed`/`awk` à supposer présents, et un parseur trivial. Le `||
 * true` absorbe le code 1 de `git grep` (aucun match), qui est un résultat, pas
 * une panne.
 *
 * `| head` est INTERDIT dans `grepRepo` parce qu'il masquerait le code de sortie
 * de git, seul moyen d'y distinguer « aucun match » d'une erreur de motif. Ici on
 * jette ce code de toute façon (`|| true`), donc il n'y a rien à masquer : le cap
 * évite juste de faire traverser mille chemins à la sortie pour un motif qui sera
 * jeté un cran plus loin. Une ligne de plus que le cap suffit à le savoir.
 */
export function buildClosureCommand(needles: readonly string[]): string {
  const groups = needles.map(
    (needle) =>
      `printf '%s\\n' ${sq(GROUP_MARK + needle)}; git grep --no-color -I -l -F --untracked -e ${sq(needle)} | head -n ${MAX_FILES_PER_NEEDLE + 1} || true;`,
  );
  return groups.join(" ");
}

/** Découpe la sortie de `buildClosureCommand` en fichiers par motif. */
export function parseClosureOutput(stdout: string): Map<string, string[]> {
  const byNeedle = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith(GROUP_MARK)) {
      current = [];
      byNeedle.set(line.slice(GROUP_MARK.length).trim(), current);
      continue;
    }
    const path = line.trim();
    if (current && path) current.push(path);
  }
  return byNeedle;
}

// ── Ce que le plan nomme déjà ────────────────────────────────────────────────

/**
 * Le plan nomme-t-il ce fichier ?
 *
 * Trois formes admises, de la plus stricte à la plus lâche : le chemin complet,
 * un suffixe d'au moins deux segments (`objectives/page.tsx` pour
 * `app/objectives/page.tsx` — un plan écrit souvent le chemin court), et le
 * basename seul quand il est distinctif (jamais `page.tsx`).
 *
 * Volontairement LÂCHE : un faux « déjà nommé » ne coûte qu'un silence, quand un
 * faux « oublié » coûte au modèle une vérification inutile à chaque plan. Entre
 * les deux erreurs, la bavarde est la seule qui se paie à tous les coups.
 */
export function planNamesFile(plan: string, file: string): boolean {
  const path = file.replace(/^\.\//, "");
  if (plan.includes(path)) return true;

  const segments = path.split("/");
  for (let i = 1; i < segments.length - 1; i++) {
    if (plan.includes(segments.slice(i).join("/"))) return true;
  }

  const base = segments[segments.length - 1];
  // Même règle qu'à l'extraction : un `page.tsx` cité tout seul ne nomme rien.
  if (!isDistinctiveStem(stemOf(base))) return false;
  return plan.includes(base);
}

// ── Le bloc servi au modèle ──────────────────────────────────────────────────

const HEADER = `Before you reply: the harness grepped the identifiers your plan names, and found files that contain them and that the plan never mentions.`;

const FOOTER = `This is an observation, not a verdict — the harness cannot tell a call site you forgot from one you left out on purpose. Open the ones that matter. If a file belongs in the plan, add it with \`append_to_plan\` (never rewrite the plan). If it does not, carry on: no need to justify the omission.`;

/**
 * Le bloc de clôture, ou `null` s'il n'y a rien à dire — le cas NORMAL, et celui
 * qui doit rester silencieux : un plan complet ne mérite pas un paragraphe qui
 * dit qu'il est complet.
 *
 * PUR : la sandbox est lue par l'appelant, comme `formatTypeErrors` et
 * `formatSelfReview`, pour que le tri, les caps et la formulation se testent sans
 * microVM.
 */
export function formatPlanClosure(input: {
  /** Le markdown du plan écrit ce tour (appends du même tour compris). */
  plan: string;
  /** Ce que le grep a rendu, par motif. */
  hits: readonly ClosureHit[];
}): string | null {
  const kept = input.hits
    // Un motif trop répandu ne dit rien de la clôture du plan (cf. MAX_FILES_PER_NEEDLE).
    .filter((hit) => hit.files.length > 0 && hit.files.length <= MAX_FILES_PER_NEEDLE)
    .map((hit) => ({
      ...hit,
      files: hit.files.filter((file) => !planNamesFile(input.plan, file)),
    }))
    .filter((hit) => hit.files.length > 0);

  if (kept.length === 0) return null;

  const shown = kept.slice(0, NEEDLES_SHOWN);
  const blocks = shown.map((hit) => {
    const files = hit.files.slice(0, FILES_SHOWN_PER_NEEDLE);
    const hidden = hit.files.length - files.length;
    const label = hit.needle === hit.source ? `\`${hit.needle}\`` : `\`${hit.source}\``;
    const via = hit.needle === hit.source ? "" : ` (grepped as \`${hit.needle}\`)`;
    return `${label}${via} — ${hit.files.length} file${hit.files.length > 1 ? "s" : ""} your plan does not mention:\n${files
      .map((file) => `- ${file}`)
      .join("\n")}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`;
  });
  const more =
    kept.length > shown.length
      ? `\n\n… and ${kept.length - shown.length} other identifier${kept.length - shown.length > 1 ? "s" : ""} in the same case.`
      : "";

  return `${HEADER}\n\n${blocks.join("\n\n")}${more}\n\n${FOOTER}`;
}

// ── Le crochet impur ─────────────────────────────────────────────────────────

/**
 * Lance le grep de clôture dans la sandbox et rend le bloc à servir, ou `null`.
 *
 * Best-effort de bout en bout, comme le type-check : pas de dépôt, `git` absent,
 * timeout, sortie illisible → `null`. Un contrôle de clôture qui ferait échouer un
 * tour serait un contrôle qu'on retirerait la semaine suivante.
 */
export async function planClosureForTurn(host: RepoHost, plan: string): Promise<string | null> {
  const needles = planNeedles(plan);
  if (needles.length === 0) return null;
  try {
    const res = await host.exec(buildClosureCommand(needles.map((n) => n.needle)), {
      cwd: REPO_DIR,
      timeoutMs: PLAN_CLOSURE_TIMEOUT_MS,
    });
    // La commande sort en 0 quoi qu'il arrive (`|| true`) : un dépôt absent ou un
    // `git` introuvable rendent des groupes VIDES, et `formatPlanClosure` se tait
    // tout seul. Ce garde ne couvre donc que l'échec du shell lui-même — sandbox
    // morte, commande tuée par le timeout —, où la sortie est un fragment.
    if (res.exitCode !== 0) return null;
    const byNeedle = parseClosureOutput(res.stdout);
    const hits: ClosureHit[] = needles.map(({ needle, source }) => ({
      needle,
      source,
      files: byNeedle.get(needle) ?? [],
    }));
    return formatPlanClosure({ plan, hits });
  } catch {
    return null;
  }
}

/** Le plan écrit pendant un tour, tel que les crochets de fin de tour le lisent
 *  — la clôture d'ici, et la relecture de `plan-review.ts` (MIN-237). */
export interface PlanWriteSink {
  /** Un `write_issue_plan` a RÉUSSI ce tour — sans ça, rien à vérifier. */
  wrote: boolean;
  /** Le markdown vérifié : le plan écrit, plus les blocs ajoutés dans le même
   *  tour (ils nomment des fichiers, donc ils comptent comme couverture). */
  markdown: string;
}

/**
 * Un sink neuf. Vit à l'échelle du CHUNK, comme `selfReviewed` et pour la même
 * raison : il ne voyage pas dans le checkpoint.
 *
 * Ce que ça laisse passer, dit plutôt qu'à découvrir : côté FONCTION, un chunk qui
 * meurt entre le `write_issue_plan` et la fin du tour repart sans le plan, donc sans
 * contrôle. Le prix de le faire voyager serait un plan de 64 ko de plus dans un
 * checkpoint que `fitCheckpoint` taille déjà au plus juste, pour une fenêtre de
 * quelques secondes — et la fenêtre n'existe pas du tout dans la microVM (MIN-224),
 * où le tour entier tient dans un seul processus.
 */
export function newPlanWriteSink(): PlanWriteSink {
  return { wrote: false, markdown: "" };
}

/**
 * Enveloppe le handler des tools ticket pour noter, au passage, le plan que le
 * tour écrit. Le sink est muté ici et lu par le crochet de fin de tour — même
 * découpage que `editedPaths` pour le type-check.
 *
 * On ne note QUE les appels réussis : un `write_issue_plan` refusé (ticket
 * introuvable, plan vide) n'a rien écrit, et grep son markdown ferait parler le
 * harness d'un plan qui n'existe pas.
 *
 * `append_to_plan` ne DÉCLENCHE pas le contrôle (le plan qu'il complète n'est pas
 * dans ses arguments, donc on ne saurait pas ce qui est déjà nommé) mais il
 * COMPTE quand un `write_issue_plan` a eu lieu dans le même tour.
 *
 * `edit_issue_text` sur le plan est REJOUÉ sur le markdown noté (MIN-237) : c'est
 * par lui que le modèle corrige son plan après la relecture, et la clôture tourne
 * APRÈS elle. Sans ce rejeu, le grep rapporterait comme oublié un fichier que le
 * modèle vient de nommer. La substitution est celle du tool (unique, ou globale
 * avec `replace_all`), appliquée seulement si le passage est présent ici : notre
 * copie ne couvre que ce que CE tour a écrit, celle du serveur peut être plus
 * large, et un patch qui ne s'applique pas ne doit rien casser.
 */
export function watchPlanWrites(
  handler: PlatformToolHandler,
  sink: PlanWriteSink,
): PlatformToolHandler {
  return async (name, args) => {
    const out = await handler(name, args);
    if (!out.success) return out;
    if (name === "write_issue_plan" && typeof args.plan === "string") {
      sink.wrote = true;
      sink.markdown = args.plan;
    } else if (name === "append_to_plan" && typeof args.markdown === "string") {
      sink.markdown = `${sink.markdown}\n\n${args.markdown}`;
    } else if (name === "edit_issue_text" && args.field === "plan") {
      const from = typeof args.old_string === "string" ? args.old_string : "";
      const to = typeof args.new_string === "string" ? args.new_string : null;
      if (from && to != null && sink.markdown.includes(from)) {
        sink.markdown =
          args.replace_all === true
            ? sink.markdown.split(from).join(to)
            : sink.markdown.replace(from, to);
      }
    }
    return out;
  };
}
