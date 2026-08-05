import type { PullRequestFile } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * L'arbre des fichiers TOUCHÉS par une PR (MIN-182) — pas le dépôt, seulement ce
 * que le diff contient. Construit depuis les seuls chemins de `files` : aucun
 * appel réseau, aucune connaissance du dépôt.
 *
 * Deux règles font tout le travail :
 *
 * - **les dossiers à enfant unique se replient sur une ligne** — sur une PR qui
 *   ne touche qu'un écran, `app/(app)/lab/diff` vaut mieux que quatre niveaux
 *   d'indentation dont trois ne disent rien ;
 * - **les compteurs remontent** — un dossier porte la somme de ce qu'il
 *   contient, ce qui donne la carte des poids sans avoir à tout déplier.
 *
 * Pur et sans React, comme `pr-review-threads` ou `pr-diff-hunk` : la structure
 * se teste sans monter quoi que ce soit.
 */

/**
 * Statut normalisé d'un fichier. GitHub en connaît plus que les quatre qu'on
 * peint (`copied`, `changed`, `unchanged`) : tout ce qui n'est pas un ajout, un
 * retrait ou un renommage se dit « modifié ». `previous_filename` sert de
 * second témoin du renommage — GitLab le pose aussi.
 */
export type FileStatus = "added" | "removed" | "renamed" | "modified";

export function fileStatusOf(file: PullRequestFile): FileStatus {
  if (file.status === "added" || file.status === "removed") return file.status;
  if (file.status === "renamed" || file.previous_filename) return "renamed";
  return "modified";
}

/**
 * Le mot du statut, une seule fois pour les deux surfaces qui le disent : le
 * badge de la carte de fichier et l'icône d'une ligne de l'arbre. Typée
 * `MessageKey` et pas `string` — une clé fautive doit refuser de compiler, pas
 * s'afficher en clair (cf. [lib/i18n-keys.ts](lib/i18n-keys.ts)).
 */
export const FILE_STATUS_LABELS = {
  added: "fileAdded",
  removed: "fileRemoved",
  renamed: "fileRenamed",
  modified: "fileModified",
} as const satisfies Record<FileStatus, MessageKey<"PullRequests">>;

/**
 * L'ancre DOM de la carte d'un fichier. Le chemin tel quel : `getElementById`
 * n'échappe rien, donc un espace ou une parenthèse dans un nom de fichier ne
 * pose pas de question. Stable d'un rendu à l'autre — c'est ce qui en fait une
 * cible de lien.
 */
export function fileAnchorId(filename: string): string {
  return `pr-file-${filename}`;
}

interface FileTreeCommon {
  /** Ce que la ligne affiche : un segment, ou plusieurs si le dossier est replié. */
  label: string;
  /** Chemin complet depuis la racine — clé de rendu, et pour un fichier, l'ancre. */
  path: string;
  /** Cumulés pour un dossier, ceux du fichier pour une feuille. */
  additions: number;
  deletions: number;
}

export interface FileTreeFile extends FileTreeCommon {
  kind: "file";
  status: FileStatus;
  /** Le fichier tel que la forge l'a servi — le renommage, le patch, tout est là. */
  file: PullRequestFile;
}

export interface FileTreeDir extends FileTreeCommon {
  kind: "dir";
  children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFile | FileTreeDir;

/** Dossier en cours de construction : une map de sous-dossiers et ses fichiers. */
interface DirDraft {
  name: string;
  dirs: Map<string, DirDraft>;
  files: PullRequestFile[];
}

/**
 * Alphabétique, insensible à la casse comme les explorateurs de fichiers, et
 * numérique pour que `10` suive `9`. Locale FIGÉE : l'ordre des fichiers d'une
 * PR n'a pas à changer selon la langue de qui la regarde.
 */
const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/**
 * Ce qu'une feuille annonce. Un renommage qui change le NOM le dit sur la ligne
 * (`ancien → nouveau`) ; un simple déplacement, non — l'arbre le montre déjà en
 * plaçant le fichier sous son nouveau dossier, et répéter le chemin d'origine
 * doublerait la ligne pour ne rien apprendre. Le chemin complet d'avant reste
 * sur `file.previous_filename`, pour l'infobulle.
 */
function leafLabel(file: PullRequestFile): string {
  const name = basename(file.filename);
  if (!file.previous_filename) return name;
  const from = basename(file.previous_filename);
  return from === name ? name : `${from} → ${name}`;
}

function leafNode(file: PullRequestFile): FileTreeFile {
  return {
    kind: "file",
    label: leafLabel(file),
    path: file.filename,
    additions: file.additions,
    deletions: file.deletions,
    status: fileStatusOf(file),
    file,
  };
}

function totals(children: FileTreeNode[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const child of children) {
    additions += child.additions;
    deletions += child.deletions;
  }
  return { additions, deletions };
}

/** Dossiers d'abord, puis fichiers, chaque groupe trié par son nom. */
function childrenOf(draft: DirDraft, path: string): FileTreeNode[] {
  const dirs = [...draft.dirs.values()]
    .sort((a, b) => COLLATOR.compare(a.name, b.name))
    .map((child) => dirNode(child, path));
  const files = [...draft.files]
    .sort((a, b) => COLLATOR.compare(basename(a.filename), basename(b.filename)))
    .map(leafNode);
  return [...dirs, ...files];
}

function dirNode(draft: DirDraft, parentPath: string): FileTreeDir {
  const path = parentPath ? `${parentPath}/${draft.name}` : draft.name;
  const children = childrenOf(draft, path);
  // Un dossier dont l'unique enfant est un DOSSIER n'ajoute qu'un cran
  // d'indentation : les deux lignes n'en font qu'une. Le fils est déjà replié
  // (le parcours est postfixe), donc une chaîne entière se ramasse d'un coup.
  // Un unique enfant FICHIER, lui, ne se replie pas : le dossier reste ce qui
  // se déplie, et son fichier ce qui s'ouvre.
  const inner = children.length === 1 && children[0].kind === "dir" ? children[0] : null;
  const effective = inner ? inner.children : children;
  return {
    kind: "dir",
    label: inner ? `${draft.name}/${inner.label}` : draft.name,
    path: inner ? inner.path : path,
    children: effective,
    ...totals(effective),
  };
}

/**
 * L'arbre, prêt à rendre. Les fichiers arrivent dans l'ordre de la forge ; le
 * tri est le nôtre, et il ne dépend que des chemins.
 */
export function buildFileTree(files: PullRequestFile[]): FileTreeNode[] {
  const root: DirDraft = { name: "", dirs: new Map(), files: [] };
  for (const file of files) {
    // `filter(Boolean)` : un chemin qui commencerait par `/` ou porterait un
    // double séparateur créerait sinon un dossier sans nom.
    const segments = file.filename.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      let next = dir.dirs.get(segment);
      if (!next) {
        next = { name: segment, dirs: new Map(), files: [] };
        dir.dirs.set(segment, next);
      }
      dir = next;
    }
    dir.files.push(file);
  }
  return childrenOf(root, "");
}
