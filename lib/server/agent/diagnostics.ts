import { REPO_DIR, type RepoHost } from "./repo-host";

/**
 * Type-check de fin de tour (MIN-110) — le harness a le dernier mot avant que
 * l'agent ne rende la main.
 *
 * OpenCode referme la boucle DANS le tool d'édition : chaque `edit` touche le
 * fichier côté LSP et recolle les diagnostics au résultat. On ne peut pas copier
 * ça tel quel, et la mesure le dit (docs/agent-harness-comparison.md §3.3, section
 * « Coût d'un type-check dans la sandbox ») : dans notre microVM, un `tsc --noEmit`
 * incrémental coûte 4,9 s au plancher, ~11 s en régime normal, 14,4 s quand le
 * fichier touché est un carrefour. Par édition, le run le plus lourd de notre
 * histoire paierait jusqu'à 290 s — plus que la soft-deadline d'un chunk. Et
 * surtout, un changement cohérent s'étale sur plusieurs fichiers : checker ENTRE
 * deux moitiés d'un même changement remonte des erreurs que l'édition suivante
 * efface.
 *
 * D'où : UN check par tour, au moment où le modèle s'apprête à répondre, et
 * seulement si le tour a touché des fichiers. S'il reste des erreurs, elles sont
 * injectées comme message `user` et le tour REPART (une seule fois — le second
 * check vérifie le correctif, puis le tour se termine quoi qu'il arrive).
 *
 * TOUT ici est best-effort et SILENCIEUX en cas de doute : pas de `tsconfig.json`,
 * pas de `node_modules/.bin/tsc` (notre échec de production le plus fréquent :
 * `tsc: command not found`, le modèle lançant `npm run typecheck` avant d'installer),
 * timeout, sortie illisible → `null`. Un harness qui transformerait un
 * environnement pas installé en mur d'erreurs serait pire que silencieux.
 */

/** Budget mural d'un type-check. Mesuré : 22 s à froid, ~11 s à chaud sur minddy.
 *  Large pour un gros dépôt, borné pour ne jamais manger un chunk entier. */
export const TYPECHECK_TIMEOUT_MS = 120_000;
/** Budget minimum restant sur le chunk pour lancer un check (sinon on se tait). */
export const TYPECHECK_MIN_BUDGET_MS = 60_000;
/** Cap du bloc d'erreurs renvoyé au modèle. Au-delà, il ne lit plus, il subit. */
export const TYPE_ERRORS_MAX_CHARS = 2000;
/**
 * `.tsbuildinfo` gardé HORS du dépôt : le `git add -A` de fin de tour ne le voit
 * jamais, et `git status` reste propre pour le modèle (même raison que
 * TOOL_OUTPUT_DIR). Persiste dans le snapshot de la microVM → les tours suivants
 * repartent à chaud (22 s → 11 s).
 */
const TSBUILDINFO = "/vercel/sandbox/typecheck/agent.tsbuildinfo";

/** En-tête du bloc d'erreurs. Formulation d'OpenCode (« … please fix: »), dont on
 *  sait qu'elle fonctionne, recalée sur notre portée : le tour, pas le fichier. */
const HEADER = "Type errors detected after your changes, please fix:";
/** Rappel anti-boucle : un dépôt déjà cassé ne doit pas devenir le sujet du tour. */
const FOOTER =
  "If an error is unrelated to what you changed (it was already there), do not fix it — say so in your reply.";

/** Une erreur de typage telle que `tsc --pretty false` la rend. */
export interface TypeErrorEntry {
  /** Chemin relatif au dépôt, tel que tsc l'imprime. */
  file: string;
  /** La ligne complète, élaborations indentées comprises. */
  text: string;
}

/** Le type-checker du dépôt, s'il est utilisable ICI ET MAINTENANT. */
export interface TypeChecker {
  /** Version majeure de TypeScript (`--incremental` avec `--noEmit` exige TS ≥ 5). */
  major: number;
}

/**
 * Le dépôt a-t-il un type-checker RÉELLEMENT exécutable ? `tsconfig.json` seul ne
 * suffit pas — sans `node_modules`, `tsc` n'existe pas. Une seule commande (1 ms
 * dans la VM, le round-trip domine). Best-effort : tout échec → `null`.
 */
export async function detectTypeChecker(host: RepoHost): Promise<TypeChecker | null> {
  try {
    const res = await host.exec(
      `test -f tsconfig.json && test -x ./node_modules/.bin/tsc && ./node_modules/.bin/tsc --version`,
      { cwd: REPO_DIR, timeoutMs: 30_000 },
    );
    if (res.exitCode !== 0) return null;
    const major = Number(/Version (\d+)\./.exec(res.stdout)?.[1] ?? NaN);
    return Number.isFinite(major) ? { major } : null;
  } catch {
    return null;
  }
}

/**
 * Lance le type-check du dépôt et renvoie le bloc à servir au modèle, ou `null`
 * s'il n'y a rien à dire. `touched` = les chemins que le tour a édités : ils
 * passent EN TÊTE du bloc (c'est le lien « ton édition → cette erreur » que le
 * ticket cherche à rétablir), le reste du dépôt derrière.
 */
export async function typeErrorsForTurn(
  host: RepoHost,
  touched: readonly string[],
): Promise<string | null> {
  const checker = await detectTypeChecker(host);
  if (!checker) return null;

  // `--incremental` explicite : le tsconfig du dépôt ne l'active pas forcément, et
  // c'est lui qui fait passer les tours suivants de 22 s à 11 s. Interdit avec
  // `--noEmit` avant TS 5 → on s'en passe (on paie le prix fort, mais on parle).
  const incremental =
    checker.major >= 5 ? ` --incremental --tsBuildInfoFile ${TSBUILDINFO}` : "";
  try {
    const res = await host.exec(
      `mkdir -p $(dirname ${TSBUILDINFO}); ./node_modules/.bin/tsc --noEmit --pretty false${incremental} 2>&1`,
      { cwd: REPO_DIR, timeoutMs: TYPECHECK_TIMEOUT_MS },
    );
    // exitCode 0 = rien à dire. Non nul SANS erreur analysable = panne d'outil
    // (tsconfig illisible, OOM, timeout) : `formatTypeErrors` renvoie null.
    return formatTypeErrors(res.stdout + res.stderr, touched);
  } catch {
    return null;
  }
}

/** `path/to/file.ts(12,3): error TS2322: …` — la forme de `tsc --pretty false`. */
const ERROR_LINE = /^(\S[^(]*)\((\d+),(\d+)\): error (TS\d+): /;

/**
 * Découpe une sortie `tsc --pretty false` en erreurs. Une entrée commence à une
 * ligne `fichier(l,c): error TSxxxx:` et absorbe les lignes indentées qui la
 * suivent (les élaborations de TypeScript, souvent le seul endroit où il dit
 * POURQUOI). Tout ce qui n'appartient à aucune entrée est jeté — dont les erreurs
 * de configuration sans fichier (`TS5083`, `TS18003`), qui ne concernent pas le
 * modèle et le mèneraient sur une fausse piste.
 */
export function parseTypeErrors(raw: string): TypeErrorEntry[] {
  const entries: TypeErrorEntry[] = [];
  for (const line of raw.split("\n")) {
    const m = ERROR_LINE.exec(line);
    if (m) {
      entries.push({ file: m[1], text: line.trimEnd() });
      continue;
    }
    // Élaboration : rattachée à l'erreur en cours, jamais orpheline.
    if (entries.length > 0 && /^\s+\S/.test(line)) {
      entries[entries.length - 1].text += `\n${line.trimEnd()}`;
    }
  }
  return entries;
}

/**
 * Rend le bloc servi au modèle : en-tête, erreurs des fichiers TOUCHÉS d'abord,
 * puis les autres, cap à `TYPE_ERRORS_MAX_CHARS`. `null` s'il n'y a aucune erreur
 * analysable — l'appelant se tait alors complètement.
 *
 * Pur (aucune sandbox) : c'est ici que vivent le tri, le cap et la formulation,
 * donc c'est ici que portent les tests.
 */
export function formatTypeErrors(raw: string, touched: readonly string[]): string | null {
  const entries = parseTypeErrors(raw);
  if (entries.length === 0) return null;

  const isTouched = new Set(touched.map(normalizePath));
  const mine = entries.filter((e) => isTouched.has(normalizePath(e.file)));
  const others = entries.filter((e) => !isTouched.has(normalizePath(e.file)));
  const ordered = [...mine, ...others];

  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of ordered) {
    // +1 pour le saut de ligne. On s'arrête AVANT de dépasser : un bloc coupé au
    // milieu d'une erreur ferait lire au modèle un chemin ou un message tronqué.
    if (used + entry.text.length + 1 > TYPE_ERRORS_MAX_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length + 1;
    shown++;
  }
  // Cap atteint dès la première erreur (une élaboration monstrueuse) : on la sert
  // quand même, tronquée — mieux qu'un bloc vide qui dirait « tout va bien ».
  if (lines.length === 0) {
    lines.push(ordered[0].text.slice(0, TYPE_ERRORS_MAX_CHARS));
    shown = 1;
  }

  const hidden = ordered.length - shown;
  const more = hidden > 0 ? `\n… and ${hidden} more error${hidden > 1 ? "s" : ""}.` : "";
  return `${HEADER}\n${lines.join("\n")}${more}\n${FOOTER}`;
}

/** `./lib/a.ts` et `lib/a.ts` sont le même fichier ; tsc et nos tools ne les
 *  écrivent pas pareil. Comparaison sur une forme unique. */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}
