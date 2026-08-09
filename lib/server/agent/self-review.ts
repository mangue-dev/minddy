import { headTail } from "./prune";
import { grepRepo, type RepoHost } from "./repo-host";

/**
 * Auto-relecture EXÉCUTÉE de fin de tour.
 *
 * Le prompt système demande depuis toujours, à l'étape 4 de « How to work » :
 * « Run `git diff` and read your change end to end before replying ». C'était une
 * politesse — rien ne l'exécutait, rien ne vérifiait qu'elle avait eu lieu. Or le
 * dépôt applique partout ailleurs la règle inverse : les interdits git sont
 * ANNONCÉS comme exécutés parce qu'ils le sont (command-guard.ts, MIN-108), et
 * le type-check de fin de tour PARLE au modèle au lieu d'espérer qu'il le lance
 * (diagnostics.ts, MIN-110). Ce module applique la même doctrine à la relecture :
 * le diff du tour est mis DANS le contexte du modèle avant qu'il ne réponde.
 *
 * Ce que ça attrape, et que rien d'autre n'attrapait : l'erreur de JOINTURE —
 * deux fichiers écrits dans le même geste, chacun correct isolément, dont le
 * contrat entre eux est faux. Le cas fondateur : `"deleteViewTitle": "Delete
 * “{name}”?"` dans le catalogue, `t("deleteViewTitle")` dans le composant. Ni
 * le type-check ni les tests du dépôt ne voyaient la faute (cf.
 * lib/i18n-contract.test.ts, écrit pour celle-là) — et une relecture fichier par
 * fichier ne la voit pas non plus, parce que chaque moitié passe. Il faut avoir
 * les deux versants sous les yeux EN MÊME TEMPS, ce que le diff du tour donne.
 *
 * Le diff est présenté comme la sortie d'un `git diff` que le harness a lancé À
 * SA PLACE — l'agent n'a donc aucune raison de le relancer, et le round coûte
 * une injection plutôt qu'un aller-retour de tool.
 *
 * CE QUE LE DIFF SEUL NE MONTRE PAS (MIN-252). La relecture ci-dessus pose la
 * bonne question — « *a value produced in one file and consumed in another — do
 * the two sides agree?* » — et sur le run de la PR 48 le modèle y a répondu
 * honnêtement : la chaîne de données ÉTAIT cohérente. Le défaut était ailleurs.
 * `onEvent: (row) => { setLive(null) }` remettait à `null` l'état que le
 * changement venait de poser, depuis une ligne NON MODIFIÉE, absente des quatre
 * hunks. Une relecture de diff ne peut pas voir ce qui n'est pas dans le diff —
 * et ce n'était pas un problème de contexte : le modèle avait lu cette ligne
 * deux appels avant d'éditer, sans élagage entre-temps. Il l'avait lue et ne
 * l'a pas reliée à ce qu'il écrivait.
 *
 * D'où le second bloc : les AUTRES sites d'écriture des états que le diff écrit,
 * lus dans le dépôt et pas dans le diff. Même famille d'erreur que celle qui a
 * motivé le premier — un défaut invisible fichier par fichier — décalée d'un
 * cran : invisible DIFF PAR DIFF. Et c'est un `grep` que le harness peut faire
 * lui-même, comme il fait déjà `git diff` à la place du modèle.
 *
 * ASSUMÉ, parce que le parfait est hors de portée : aucune analyse de flot. On
 * extrait des identifiants des lignes ajoutées et on les cherche, comme le
 * ferait un relecteur pressé. Ça rend des faux positifs — acceptable, le bloc
 * est court et le modèle trie. Ce qui ne l'est pas, c'est ce qu'on avait avant :
 * zéro signal.
 */

/** Cap du diff injecté. Au-delà, le modèle ne relit plus, il subit — même
 *  raisonnement que `TYPE_ERRORS_MAX_CHARS`, calibré plus haut parce qu'un diff
 *  se lit en entier ou ne se lit pas. Élision par le MILIEU (`headTail`) : le
 *  début et la fin d'un diff portent les fichiers, pas le remplissage. */
export const SELF_REVIEW_DIFF_MAX_CHARS = 12_000;

/** Cap du bloc « qui écrit ça ailleurs ». Un ORDRE DE GRANDEUR sous le diff, et
 *  c'est voulu : ce bloc ACCOMPAGNE le diff, il ne le concurrence pas. Un
 *  paragraphe de grep plus long que le changement qu'il commente se lit comme le
 *  sujet du tour, ce qu'il n'est pas. */
export const SELF_REVIEW_OVERWRITES_MAX_CHARS = SELF_REVIEW_DIFF_MAX_CHARS / 6;

/** Budget mural minimum restant sur le chunk pour injecter une relecture.
 *
 *  Rallongé en MIN-252 : le geste n'est plus « deux commandes git » — il porte
 *  maintenant jusqu'à `MAX_ASSIGNED_SYMBOLS` greps (lancés ensemble, mais chacun
 *  traverse le dépôt), et le bloc qui en sort demande une VÉRIFICATION, pas une
 *  lecture. Servir ça à un modèle qui n'a plus le temps d'ouvrir un fichier
 *  produirait le pire des deux mondes : une question posée, jamais instruite. */
export const SELF_REVIEW_MIN_BUDGET_MS = 75_000;

/** Fichiers non suivis listés par nom (au-delà, on dit combien il en reste). */
const UNTRACKED_MAX = 20;

const HEADER = `Before you reply, here is what this turn actually changed. The harness ran \`git diff\` for you — do not run it again.`;

const INSTRUCTIONS = `Read it end to end, as a reviewer would, then either fix what you find or reply.

Check especially what is only visible ACROSS files, because each file alone looks right:
- a value produced in one file and consumed in another (i18n placeholders, props, payload fields, env vars, DB columns) — do the two sides agree?
- something added in one place that its counterpart still ignores (a new case, a new state, a new option);
- anything you changed halfway and did not finish.
Then the usual: no stray debug or scratch file, no leftover commented-out code, nothing unrelated to what was asked.

If it is all correct, carry on — do not restate the diff, and do not announce that you re-read it.`;

/** Un fichier non suivi, tel que `git status --porcelain` le rend. */
export function parseUntracked(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/**
 * Le bloc d'auto-relecture, ou `null` s'il n'y a rien à relire.
 *
 * PUR : la sandbox est lue par l'appelant (execute.ts), pour que la mise en
 * forme, les caps et la formulation restent testables sans microVM — même
 * découpage que `formatTypeErrors`.
 */
export function formatSelfReview(input: {
  /** Sortie de `git diff <baseline>` : les fichiers SUIVIS modifiés ce tour. */
  diff: string;
  /** Sortie de `git status --porcelain` : sert à lister les fichiers ajoutés. */
  porcelain?: string;
  /** Les autres écritures des états que le diff écrit (`overwriteSitesForTurn`). */
  overwrites?: readonly OverwriteHit[];
}): string | null {
  const diff = input.diff.trim();
  const untracked = parseUntracked(input.porcelain ?? "");

  // Rien de suivi modifié ET rien de neuf : le tour n'a pas touché au dépôt.
  if (!diff && untracked.length === 0) return null;

  const shown = untracked.slice(0, UNTRACKED_MAX);
  const hidden = untracked.length - shown.length;
  const untrackedBlock =
    untracked.length > 0
      ? `\n\nNew files this turn (untracked, so absent from the diff above):\n${shown
          .map((path) => `- ${path}`)
          .join("\n")}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`
      : "";

  const diffBlock = diff
    ? `\n\n\`\`\`diff\n${headTail(diff, SELF_REVIEW_DIFF_MAX_CHARS)}\n\`\`\``
    : "\n\n(No tracked file was modified.)";

  const overwrites = formatOverwrites(input.overwrites ?? []);

  return `${HEADER}${diffBlock}${untrackedBlock}\n\n${INSTRUCTIONS}${overwrites}`;
}

// ── Ce qui, AILLEURS, écrit le même état (MIN-252) ───────────────────────────

/** Symboles extraits du diff, au maximum. Au-delà, le bloc noierait le diff
 *  qu'il accompagne — et les premières écritures d'un tour sont celles qui
 *  portent le changement. */
export const MAX_ASSIGNED_SYMBOLS = 15;
/** Sites RAPPORTÉS par symbole. Trois suffisent à faire ouvrir le fichier ;
 *  au-delà on liste, on ne montre plus. */
export const MAX_SITES_PER_SYMBOL = 3;
/**
 * Au-delà de ce nombre de sites, un symbole est JETÉ plutôt que rapporté.
 *
 * C'est le garde-fou qui décide de l'utilité de tout le mécanisme, et il tient
 * lieu de liste de mots vides (même raisonnement qu'en `plan-closure.ts`) : un
 * nom générique — `data`, `value`, `state` — est écrit partout, donc il tombe
 * ici tout seul, sans qu'on ait à tenir une liste que chaque convention de
 * framework périmerait. Un état qu'on écrit d'un seul autre endroit, lui, est
 * exactement le cas fondateur.
 */
export const MAX_SITES_SCANNED = 12;
/** Symboles détaillés dans le bloc rendu. */
const SYMBOLS_SHOWN = 6;
/** Fichiers du dépôt fouillés : le code, pas la doc ni les catalogues. */
const CODE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
/** Sous ça, un identifiant est un compteur de boucle, pas un état. */
const MIN_SYMBOL_LENGTH = 4;

/**
 * La FORME d'écriture qui a fait retenir un symbole. Elle porte le motif grepé,
 * donc elle décide de ce qu'on trouvera — et elle se dit au modèle, qui n'a pas
 * à deviner pourquoi le harness le lui montre.
 */
export type AssignedKind = "setter" | "collection" | "variable";

export interface AssignedSymbol {
  /** L'identifiant écrit : `setLive`, `cache`, `pending.current`. */
  name: string;
  kind: AssignedKind;
  /** Le motif ERE cherché dans le dépôt, dérivé du nom et de la forme. */
  pattern: string;
}

/** Un `setX(` — le setter d'un `useState`, et la forme la plus nette : tout
 *  appel est une écriture, sans exception à trier. */
const SETTER_CALL = /\b(set[A-Z][A-Za-z0-9_$]*)\s*\(/g;
/** Une collection mutée : `x.set(`, `x.add(`, `x.delete(`, `x.clear(`. */
const COLLECTION_WRITE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\.(?:set|add|delete|clear)\s*\(/g;
/**
 * Une affectation en TÊTE d'instruction : `live = …`, `cache.current = …`.
 *
 * L'ancrage en début de ligne (une fois l'indentation ôtée) est ce qui sépare
 * une écriture d'un `prop={…}` de JSX, d'un paramètre par défaut ou d'une clé
 * d'objet — aucun des trois n'ouvre une ligne. `[^=>]` après le `=` écarte
 * `==`, `===` et la flèche d'une lambda ; les déclarations sont écartées avant.
 */
const ASSIGNMENT = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)\s*=[^=>]/;
/** Une déclaration DÉCLARE, elle n'écrase rien : le symbole naît là. */
const DECLARATION = /^(?:const|let|var|export|import|type|interface|class|function|async)\b/;

/** Échappe pour une ERE POSIX — en pratique, le point d'un `x.current`. */
function escapeEre(value: string): string {
  return value.replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
}

/** Le motif d'écriture de ce symbole, selon sa forme. */
function patternFor(name: string, kind: AssignedKind): string {
  const id = escapeEre(name);
  if (kind === "setter") return `${id} *\\(`;
  if (kind === "collection") return `${id} *\\.(set|add|delete|clear) *\\(`;
  // Le garde de gauche empêche `active = …` de matcher `isActive = …` ou
  // `x.active = …` : ce qu'on cherche, c'est CE symbole, pas son homonyme.
  return `(^|[^-+*/%!<>=&|.A-Za-z0-9_$])${id} *=[^=>]`;
}

/** Une ligne d'un hunk, du côté APRÈS : celui que le dépôt porte maintenant, donc
 *  celui dont les numéros de ligne s'alignent sur ceux du grep. */
export interface HunkLine {
  text: string;
  /** Le tour l'a ÉCRITE (`+`), par opposition au contexte que git donne autour. */
  added: boolean;
  /** Son numéro dans le fichier d'aujourd'hui. */
  line: number;
}

export interface DiffHunk {
  /** Chemin relatif au dépôt, tel que `+++ b/…` le nomme. */
  file: string;
  lines: HunkLine[];
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Les hunks d'un `git diff` unifié, côté APRÈS, numéros de ligne compris.
 *
 * Ces numéros sont tout l'intérêt : ce sont eux qui permettent de dire « ce
 * match du grep EST une ligne du diff » sans comparer des textes. Sur le cas
 * fondateur la comparaison de textes se serait trompée — `setLive(null);` figure
 * TROIS fois dans le fichier, dont une dans le diff et une dans le `onEvent`
 * qu'il faut justement remonter.
 *
 * Un fichier supprimé (`+++ /dev/null`) n'a pas de côté après : il est ignoré.
 */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let file: string | null = null;
  let current: DiffHunk | null = null;
  let next = 0;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim().replace(/^b\//, "");
      file = path && path !== "/dev/null" ? path : null;
      current = null;
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      next = Number.parseInt(header[1], 10);
      current = file ? { file, lines: [] } : null;
      if (current) hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("+")) current.lines.push({ text: raw.slice(1).trim(), added: true, line: next++ });
    else if (raw.startsWith("-")) continue; // Retiré : plus dans le fichier, donc plus de numéro.
    else if (raw.startsWith(" ") || raw === "")
      current.lines.push({ text: raw.slice(1).trim(), added: false, line: next++ });
    // Tout le reste (`\ No newline`, `diff --git`, `index`) ne porte pas de ligne.
  }
  return hunks;
}

/** Le diff couvre-t-il ce `fichier:ligne` ? C'est la question que pose
 *  l'exclusion : ce que le modèle vient de lire, on ne le lui remontre pas. */
export function diffCoverage(hunks: readonly DiffHunk[]): (file: string, line: number) => boolean {
  const byFile = new Map<string, Set<number>>();
  for (const hunk of hunks) {
    let lines = byFile.get(hunk.file);
    if (!lines) byFile.set(hunk.file, (lines = new Set()));
    for (const l of hunk.lines) lines.add(l.line);
  }
  return (file, line) => byFile.get(file)?.has(line) === true;
}

/**
 * Les états que ce tour ÉCRIT, les plus directs d'abord.
 *
 * Périmètre délibérément étroit : les setters de `useState`, les collections
 * mutées, et les affectations en tête d'instruction. Ce sont les trois formes
 * qui produisent l'erreur visée — « quelqu'un d'autre remet ça à zéro ».
 *
 * LE HUNK, PAS LA LIGNE `+`. Sur le cas fondateur, le tour ajoute deux champs
 * DANS un `setLive((prev) => ({ … }))` dont la tête d'appel, elle, ne bouge pas :
 * l'écriture est le fait du hunk, elle n'est écrite sur aucune de ses lignes
 * `+`. S'en tenir aux lignes ajoutées ne trouvait rien du tout — vérifié, c'est
 * ce que faisait la première version de ce module. Le contexte que git donne
 * autour (trois lignes) est donc lu aussi, et il est lu comme ce qu'il est : le
 * voisinage immédiat du changement. Un hunk sans aucune ligne ajoutée — un pur
 * retrait — n'écrit rien et n'est pas lu.
 *
 * L'ORDRE porte le cap. Ce que le tour a tapé passe devant ce qu'il a côtoyé, et
 * les setters devant le reste : c'est la forme dont chaque occurrence est une
 * écriture, donc celle dont le grep ment le moins.
 */
export function assignedSymbols(diff: string): AssignedSymbol[] {
  const found = new Map<string, AssignedSymbol & { added: boolean }>();
  const add = (name: string, kind: AssignedKind, added: boolean) => {
    if (name.length < MIN_SYMBOL_LENGTH) return;
    const already = found.get(name);
    if (already) {
      // Le même symbole vu sur une ligne `+` vaut mieux que sur du contexte.
      if (added && !already.added) already.added = true;
      return;
    }
    found.set(name, { name, kind, pattern: patternFor(name, kind), added });
  };

  for (const hunk of parseDiffHunks(diff)) {
    if (!hunk.lines.some((l) => l.added)) continue;
    for (const { text, added } of hunk.lines) {
      for (const m of text.matchAll(SETTER_CALL)) add(m[1], "setter", added);
      for (const m of text.matchAll(COLLECTION_WRITE)) add(m[1], "collection", added);
      if (DECLARATION.test(text)) continue;
      const assigned = ASSIGNMENT.exec(text);
      if (assigned) add(assigned[1], "variable", added);
    }
  }

  const rank: Record<AssignedKind, number> = { setter: 0, collection: 1, variable: 2 };
  return [...found.values()]
    .sort((a, b) => Number(b.added) - Number(a.added) || rank[a.kind] - rank[b.kind])
    .slice(0, MAX_ASSIGNED_SYMBOLS)
    .map(({ name, kind, pattern }) => ({ name, kind, pattern }));
}

/** Un endroit du dépôt qui écrit le symbole, hors du diff. */
export interface OverwriteSite {
  /** Chemin relatif au dépôt, tel que `git grep -n` le rend. */
  file: string;
  line: number;
  /** La ligne, indentation ôtée. */
  text: string;
}

export interface OverwriteHit {
  symbol: AssignedSymbol;
  sites: OverwriteSite[];
}

/** Découpe une sortie `git grep -n` (`fichier:ligne:texte`). Une ligne dont le
 *  numéro n'est pas un nombre n'est pas un match : elle est jetée, pas devinée. */
export function parseGrepSites(output: string): OverwriteSite[] {
  const sites: OverwriteSite[] = [];
  for (const raw of output.split("\n")) {
    const first = raw.indexOf(":");
    if (first <= 0) continue;
    const second = raw.indexOf(":", first + 1);
    if (second < 0) continue;
    const line = Number.parseInt(raw.slice(first + 1, second), 10);
    if (!Number.isFinite(line)) continue;
    sites.push({ file: raw.slice(0, first), line, text: raw.slice(second + 1).trim() });
  }
  return sites;
}

/**
 * Les sites qui ne sont PAS dans le diff, les fichiers touchés d'abord.
 *
 * Une seule règle : ne jamais faire relire au modèle une ligne qu'il vient de
 * lire. L'exclusion se fait donc par `fichier:ligne` — un site couvert par un
 * hunk EST une ligne du diff — et surtout pas par le texte, qui se répète : sur
 * le cas fondateur, la ligne à remonter porte mot pour mot le même
 * `setLive(null);` qu'une ligne du diff, quinze lignes plus haut.
 *
 * L'ordre compte plus qu'il n'y paraît : le cap tombe à trois, et un autre site
 * dans un fichier que le tour vient d'éditer est de loin le plus susceptible de
 * défaire ce qu'il vient d'y poser.
 */
export function selectSites(
  sites: readonly OverwriteSite[],
  opts: { inDiff: (file: string, line: number) => boolean; touched: ReadonlySet<string> },
): OverwriteSite[] {
  const kept = sites.filter((site) => site.text && !opts.inDiff(site.file, site.line));
  return [...kept].sort((a, b) => {
    const byFile = Number(opts.touched.has(b.file)) - Number(opts.touched.has(a.file));
    return byFile !== 0 ? byFile : a.file.localeCompare(b.file) || a.line - b.line;
  });
}

const OVERWRITE_HEADER = `The harness also grepped the state your diff WRITES, and found other places that write it — lines you did not touch, so they are nowhere in the diff above.`;

const OVERWRITE_FOOTER = `Does any of them undo what you just set? A diff review cannot answer this on its own: the line that defeats a change is usually the one that did not change. This is an observation, not a verdict — most of these are legitimate. Open the ones that write the same state on the same path as your change, and reply once you have looked.`;

/** Comment le bloc dit d'où vient un symbole — le modèle doit pouvoir écarter
 *  un faux positif sans ouvrir le fichier. */
const KIND_LABEL: Record<AssignedKind, string> = {
  setter: "state setter",
  collection: "mutated collection",
  variable: "assigned variable",
};

/**
 * Le bloc « qui écrit ça ailleurs », ou `""` s'il n'y a rien à dire — le cas
 * NORMAL, et celui qui doit rester muet : un tour dont personne ne défait
 * l'écriture ne mérite pas un paragraphe qui le dit.
 *
 * PUR, comme tout le reste du module : le grep est fait par l'appelant.
 */
export function formatOverwrites(hits: readonly OverwriteHit[]): string {
  const kept = hits.filter((hit) => hit.sites.length > 0 && hit.sites.length <= MAX_SITES_SCANNED);
  if (kept.length === 0) return "";

  const shown = kept.slice(0, SYMBOLS_SHOWN);
  const blocks = shown.map((hit) => {
    const sites = hit.sites.slice(0, MAX_SITES_PER_SYMBOL);
    const hidden = hit.sites.length - sites.length;
    const lines = sites.map((site) => `- ${site.file}:${site.line}  ${site.text}`).join("\n");
    return `\`${hit.symbol.name}\` (${KIND_LABEL[hit.symbol.kind]}) — ${hit.sites.length} other write${hit.sites.length > 1 ? "s" : ""}:\n${lines}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`;
  });
  const more =
    kept.length > shown.length
      ? `\n\n… and ${kept.length - shown.length} other symbol${kept.length - shown.length > 1 ? "s" : ""} in the same case.`
      : "";

  const body = headTail(`${blocks.join("\n\n")}${more}`, SELF_REVIEW_OVERWRITES_MAX_CHARS);
  return `\n\n---\n\n${OVERWRITE_HEADER}\n\n${body}\n\n${OVERWRITE_FOOTER}`;
}

/**
 * Lance les greps dans la sandbox et rend les autres écritures, symbole par
 * symbole.
 *
 * Un grep PAR symbole, tous lancés ensemble : `grepRepo` sait déjà distinguer
 * « aucun match » d'un motif refusé et retomber en littéral (MIN-109), et
 * refaire ça dans une boucle `sh` reviendrait à réécrire ce module-là en moins
 * bien. Le prix est un aller-retour par symbole, payé en parallèle et borné par
 * `MAX_ASSIGNED_SYMBOLS`.
 *
 * Best-effort de bout en bout, comme le type-check et la clôture de plan : pas
 * de dépôt, `git` absent, timeout, motif refusé → pas de bloc, jamais un tour
 * bloqué.
 */
export async function overwriteSitesForTurn(
  host: RepoHost,
  diff: string,
): Promise<OverwriteHit[]> {
  const symbols = assignedSymbols(diff);
  if (symbols.length === 0) return [];
  const hunks = parseDiffHunks(diff);
  const inDiff = diffCoverage(hunks);
  const touched = new Set(hunks.map((hunk) => hunk.file));

  const hits = await Promise.all(
    symbols.map(async (symbol) => {
      const res = await grepRepo(host, {
        pattern: symbol.pattern,
        glob: CODE_GLOB,
        outputMode: "content",
        // Un de plus que le cap : c'est ce qui permet de SAVOIR qu'on l'a dépassé,
        // donc de jeter un symbole trop répandu au lieu d'en montrer trois sites
        // au hasard.
        headLimit: MAX_SITES_SCANNED + 1,
      }).catch(() => null);
      if (!res?.ok) return null;
      return { symbol, sites: selectSites(parseGrepSites(res.output), { inDiff, touched }) };
    }),
  );
  return hits.filter((hit): hit is OverwriteHit => hit != null && hit.sites.length > 0);
}
