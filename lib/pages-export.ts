/**
 * L'EXPORT d'une page en markdown — la logique pure (MIN-283).
 *
 * Aucune IO ici : ce module reçoit l'arbre (id, parent, titre) et le markdown
 * déjà projeté de chaque page (lib/pages-markdown.ts, MIN-269), et il en fait
 * une ARBORESCENCE DE FICHIERS. C'est tout ce qui distingue un export d'une
 * simple projection, et c'est justement la partie qui se teste sans base :
 *
 *  - un NOM DE FICHIER par page, tiré de son titre, sûr sur les trois systèmes
 *    de fichiers, et unique entre frères ;
 *  - une page qui a des enfants devient un DOSSIER (`Titre/index.md`) : c'est
 *    la seule forme qui garde l'imbrication du wiki dans une archive, et celle
 *    que tous les exports de ce genre ont convergé à produire ;
 *  - les blocs sous-page, écrits `[[page:<id>]]` par la projection, deviennent
 *    des LIENS RELATIFS entre les fichiers de l'archive. Un identifiant nu dans
 *    un fichier qu'on ouvre hors de minddy ne mène nulle part — et c'est
 *    précisément l'usage qu'on vise : emporter la doc.
 *
 * Une cible HORS de l'archive (une sous-page qu'on n'exporte pas) garde son
 * `[[page:<id>]]`. Inventer un lien qui ne résout pas serait pire que de laisser
 * la marque du document d'origine, qui, elle, dit ce qu'elle est.
 */

/** Une page telle que l'export la voit : sa place dans l'arbre, et son corps. */
export interface ExportInputPage {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  /** Le markdown de la page, en-tête compris (cf. `pageToMarkdown`). */
  markdown: string;
}

/** Un fichier de l'archive. */
export interface ExportedFile {
  /** Chemin relatif à la racine de l'archive, séparateurs `/`. */
  path: string;
  markdown: string;
}

/** Longueur max d'un segment de nom : les systèmes de fichiers plafonnent à
    255 octets, et un titre de page peut aller à 500 caractères. */
const MAX_SLUG_LENGTH = 80;

/**
 * Le nom de fichier d'une page, tiré de son titre.
 *
 * On garde les lettres accentuées et les espaces — c'est un fichier que
 * quelqu'un va ouvrir, pas une clé de storage (cf. `sanitizeFileKey`, qui
 * répond à l'autre question). Ne tombent que les caractères qu'un système de
 * fichiers refuse, et les points de tête, qui feraient un fichier caché.
 */
export function pageFileSlug(title: string): string {
  const cleaned = title
    // Les caractères de contrôle : invisibles dans un titre, refusés dans un nom.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // Interdits sur Windows, plus `/` et `\` qui ouvriraient un dossier.
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    // Windows refuse aussi un nom qui se termine par un point ou une espace.
    .replace(/[. ]+$/, "");
  return cleaned.slice(0, MAX_SLUG_LENGTH).trim() || "page";
}

/** `Titre`, `Titre (2)`, `Titre (3)`… — deux pages sœurs peuvent porter le même
    nom, deux fichiers d'un même dossier non. */
function uniqueIn(taken: Set<string>, slug: string): string {
  const key = slug.toLowerCase();
  if (!taken.has(key)) {
    taken.add(key);
    return slug;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${slug} (${n})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

const SUBPAGE_LINK = /\[\[page:([^\]\s]+)\]\]/g;

/**
 * L'archive d'une branche : un fichier par page, liens réécrits.
 *
 * `pages` porte la racine ET ses descendants, dans n'importe quel ordre. Une
 * page dont le parent n'est pas de la liste est traitée comme une racine — ce
 * qui n'arrive pas sur une branche, mais évite qu'un jeu d'entrée incohérent
 * fasse disparaître des fichiers en silence.
 */
export function exportPagesToFiles(pages: ExportInputPage[]): ExportedFile[] {
  const ids = new Set(pages.map((p) => p.id));
  const childrenOf = new Map<string, ExportInputPage[]>();
  const roots: ExportInputPage[] = [];
  for (const page of pages) {
    if (page.parent_id && ids.has(page.parent_id)) {
      const list = childrenOf.get(page.parent_id);
      if (list) list.push(page);
      else childrenOf.set(page.parent_id, [page]);
    } else {
      roots.push(page);
    }
  }

  // Le chemin de chaque page, d'abord — les liens ne peuvent être réécrits
  // qu'une fois tous les chemins connus.
  const pathOf = new Map<string, string>();
  /** `reserved` : les noms déjà pris DANS ce dossier avant qu'on nomme un seul
      frère. Il n'y en a qu'un, et c'est `index` — le dossier porte le nom de
      son parent, dont le corps s'y range sous `index.md`. Une sous-page
      intitulée « Index » y aurait écrit le même chemin, et l'archive n'aurait
      gardé qu'un des deux fichiers, en silence. */
  const assign = (siblings: ExportInputPage[], prefix: string, reserved: string[] = []) => {
    const taken = new Set<string>(reserved);
    for (const page of siblings) {
      const slug = uniqueIn(taken, pageFileSlug(page.title));
      const children = childrenOf.get(page.id) ?? [];
      // Une page qui a des enfants devient un dossier ; son propre corps s'y
      // range sous `index.md`, à côté d'eux.
      const path = children.length > 0 ? `${prefix}${slug}/index.md` : `${prefix}${slug}.md`;
      pathOf.set(page.id, path);
      if (children.length > 0) assign(children, `${prefix}${slug}/`, ["index"]);
    }
  };
  assign(roots, "");

  const files: ExportedFile[] = [];
  const walk = (list: ExportInputPage[]) => {
    for (const page of list) {
      const path = pathOf.get(page.id)!;
      files.push({
        path,
        markdown: rewriteSubpageLinks(page.markdown, path, pathOf, pages),
      });
      walk(childrenOf.get(page.id) ?? []);
    }
  };
  walk(roots);
  return files;
}

/** Les `[[page:<id>]]` d'un corps, changés en liens markdown relatifs. */
function rewriteSubpageLinks(
  markdown: string,
  fromPath: string,
  pathOf: Map<string, string>,
  pages: ExportInputPage[]
): string {
  const titleOf = new Map(pages.map((p) => [p.id, p]));
  return markdown.replace(SUBPAGE_LINK, (whole, id: string) => {
    const target = pathOf.get(id);
    if (!target) return whole;
    const page = titleOf.get(id);
    const label = page ? `${page.icon ? `${page.icon} ` : ""}${page.title || id}` : id;
    return `[${label}](${relativePath(fromPath, target)})`;
  });
}

/** Le chemin de `to` vu depuis le fichier `from` (`../autre/page.md`). */
export function relativePath(from: string, to: string): string {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const path = [...Array(up).fill(".."), ...toParts.slice(common)].join("/");
  // Un lien relatif qui descend part de `./` : sans lui, un nom contenant `:`
  // pourrait se lire comme un protocole.
  return up === 0 ? `./${path}` : path;
}

/** Le nom du fichier téléchargé : `Ma page.md`, `Ma page.zip`. */
export function exportFileName(title: string, extension: "md" | "zip"): string {
  return `${pageFileSlug(title)}.${extension}`;
}
