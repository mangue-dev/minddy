import { common, createLowlight } from "lowlight";
import type { Root, RootContent } from "hast";

/**
 * Coloration syntaxique des vues diff (MIN-66) — le moteur, partagé.
 *
 * highlight.js via lowlight, et pas shiki (déjà là pour le markdown de Numo) :
 * `tokenize` de react-diff-view appelle son coloriseur de façon SYNCHRONE, dans
 * le rendu ; shiki ne colore que de façon asynchrone (hors bundle précompilé).
 * lowlight rend un arbre hast — exactement la forme que react-diff-view attend
 * de refractor — donc il s'y branche par un simple adaptateur (`hljs` ci-dessous).
 *
 * Le jeu `common` de highlight.js (37 langages) plutôt qu'une liste maison : la
 * vue diff sert les dépôts DES UTILISATEURS, pas seulement celui de minddy — on
 * ne sait pas d'avance en quoi ils écrivent.
 *
 * Les classes émises (`hljs-keyword`, `hljs-string`…) sont peintes dans
 * `app/globals.css` : la palette est à nous, pas un thème importé, parce qu'elle
 * doit rester lisible POSÉE SUR les aplats vert/rouge du diff.
 */

const lowlight = createLowlight(common);

/**
 * Extensions dont le nom ne suffit pas à retrouver le langage. Le reste est
 * résolu par `registered()` : highlight.js connaît déjà `ts`, `tsx`, `js`,
 * `jsx`, `py`, `rb`, `md`, `yml`, `html`… comme alias.
 */
const BY_EXTENSION: Record<string, string> = {
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  svg: "xml",
  vue: "xml",
  htm: "xml",
  toml: "ini",
  cfg: "ini",
  conf: "ini",
  zsh: "bash",
  fish: "bash",
  bat: "dos",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  mm: "objectivec",
  kt: "kotlin",
  kts: "kotlin",
  rs: "rust",
  patch: "diff",
  gql: "graphql",
  prisma: "typescript",
  jsonc: "json",
  lock: "json",
};

/** Fichiers sans extension reconnus à leur nom (`Dockerfile`, `Makefile`…). */
const BY_FILENAME: Record<string, string> = {
  dockerfile: "bash",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  procfile: "bash",
  ".env": "bash",
  ".gitignore": "plaintext",
};

/**
 * Langage highlight.js d'un fichier, ou `null` si on ne sait pas — et alors on
 * ne colore pas plutôt que de deviner : un mauvais grammaire colore FAUX, ce qui
 * se lit plus mal qu'une absence de couleur.
 */
export function diffLanguage(filename: string): string | null {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";

  const byName = BY_FILENAME[base];
  if (byName) return lowlight.registered(byName) ? byName : null;

  // `.d.ts`, `.test.tsx`, `.module.css` : c'est le DERNIER segment qui porte le
  // langage, d'où le `pop` plutôt qu'un découpage au premier point.
  const ext = base.includes(".") ? (base.split(".").pop() ?? "") : "";
  if (!ext) return null;

  const mapped = BY_EXTENSION[ext] ?? ext;
  return lowlight.registered(mapped) ? mapped : null;
}

/**
 * Adaptateur au contrat que `tokenize` de react-diff-view attend de refractor :
 * `highlight(code, language) → enfants hast`. lowlight renvoie une racine, on
 * en rend les enfants.
 *
 * Un grammaire peut lever sur une entrée tordue (fragment de code coupé au
 * milieu d'une chaîne, ce qui est le cas normal d'un hunk) : on retombe alors
 * sur un noeud texte. Perdre la couleur d'un fichier vaut mieux que perdre le
 * diff.
 */
export const hljs = {
  highlight(code: string, language: string): RootContent[] {
    try {
      const root: Root = lowlight.highlight(language, code);
      return root.children;
    } catch {
      return [{ type: "text", value: code }];
    }
  },
};

/**
 * Au-delà de ce nombre de lignes rendues, un fichier n'est ni coloré ni marqué
 * mot-à-mot. Les deux passes sont SYNCHRONES (`tokenize` colore tout le fichier,
 * `markEdits` fait tourner diff-match-patch sur chaque bloc changé) : sur un
 * lockfile de 20 000 lignes elles gèlent l'onglet. Le diff, lui, s'affiche.
 */
export const MAX_HIGHLIGHT_LINES = 3000;

/** Lignes effectivement rendues, dépliages compris — la mesure du garde-fou. */
export function countLines(hunks: Array<{ changes: unknown[] }>): number {
  return hunks.reduce((n, h) => n + h.changes.length, 0);
}
