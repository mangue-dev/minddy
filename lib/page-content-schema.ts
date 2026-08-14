/**
 * Le SCHÉMA d'un corps de page, écrit en clair (MIN-350).
 *
 * Jusqu'ici `page.content` entrait comme du JSON arbitraire, borné en profondeur
 * et en taille et rien d'autre : n'importe quel type de nœud, n'importe quel
 * attribut, et surtout n'importe quel `src` — un `javascript:` rangé dans un
 * bloc fichier ressortait tel quel dans le `href` de son ancre
 * (components/pages/blocks/file-view.tsx), qui est une vraie ancre et qu'un clic
 * suit vraiment.
 *
 * Ce module est la porte. Il liste les nœuds, les marques et leurs attributs, et
 * il tranche sur les adresses.
 *
 * ## Pourquoi une liste écrite à la main, alors que le registre existe
 *
 * Le registre de blocs EST la vérité, et cette liste doit lui rester égale —
 * mais on ne peut pas la lui demander ici. La lire, c'est monter les extensions
 * tiptap, donc un éditeur, donc un DOM : `lib/server/pages.ts` valide dans une
 * fonction serveur, sur le chemin critique de chaque sauvegarde, là où la
 * projection markdown a justement dû se faire charger par chemin depuis un
 * bundle à part (cf. lib/server/pages-projection.ts). Le prix serait un jsdom
 * par écriture pour relire une liste de vingt noms.
 *
 * L'égalité, elle, n'est pas laissée à la relecture : `page-content-schema.test.ts`
 * monte le VRAI registre sous jsdom et exige que ce fichier dise exactement les
 * mêmes nœuds, les mêmes marques et les mêmes attributs. Un bloc ajouté sans son
 * entrée ici fait tomber la suite — pas la sauvegarde d'un utilisateur.
 *
 * ## Ce qu'on refuse, et ce qu'on laisse tomber
 *
 * Un nœud ou une marque INCONNUE fait refuser l'écriture entière (400) : c'est
 * du contenu qu'aucune surface ne sait rendre, et l'accepter en base voudrait
 * dire le resservir un jour à un rendu qui, lui, le comprendra. Une adresse
 * hostile, pareil — un refus est ce que l'auteur doit voir.
 *
 * Un ATTRIBUT inconnu, lui, est simplement retiré : c'est déjà ce que fait
 * ProseMirror en chargeant le document (`Node.fromJSON` ignore ce que le schéma
 * ne déclare pas), et refuser une page entière pour un attribut de plus rendrait
 * chaque déploiement de l'éditeur capable de bloquer les onglets restés ouverts.
 *
 * Module pur, sans `server-only` ni dépendance : les blocs l'importent aussi
 * (leur sérialisation markdown refuse d'écrire un lien vers une adresse que ce
 * fichier rejette), et ils sont montés headless dans une fonction serveur.
 */

/* ── Les adresses ─────────────────────────────────────────────────────────── */

/**
 * Les attributs qui portent une ADRESSE, quel que soit le nœud ou la marque.
 *
 * Par NOM et non par nœud, volontairement : le jour où un bloc vidéo arrive avec
 * son `src`, il est couvert avant d'être écrit. La contrepartie — un attribut
 * nommé `src` qui ne serait pas une URL — n'existe pas dans le schéma, et le
 * test le tient.
 */
const URL_ATTRIBUTES = new Set(["src", "href"]);

/**
 * Les protocoles qu'une adresse de page a le droit de porter.
 *
 * `http`/`https` parce qu'une image externe est un cas normal et documenté (cf.
 * blocks/image.ts : `![graphe](https://…)` écrit par Numo doit marcher), et
 * `mailto` parce qu'un lien de contact dans une page en est un.
 *
 * Tout le reste tombe, `javascript:` en tête, mais aussi `data:` (une page HTML
 * en base64 dans un `href` est un XSS complet à un clic) et `blob:`.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * `true` si cette adresse peut être rangée dans un corps de page.
 *
 * Les adresses RELATIVES (`/api/projects/…`, la forme que prennent nos propres
 * fichiers) sont acceptées telles quelles : elles n'ont pas de protocole, donc
 * pas de protocole à refuser, et elles ne peuvent désigner que nous.
 *
 * La normalisation compte autant que la liste : `java\tscript:alert(1)` est une
 * URL que le navigateur suit et qu'une comparaison naïve laisse passer. On
 * retire donc les blancs et les caractères de contrôle AVANT de lire le
 * protocole — et comme c'est cette même chaîne nettoyée qu'on renvoie à
 * l'appelant ({@link normalizePageUrl}), ce qui est rangé est ce qui a été jugé.
 */
export function isSafePageUrl(value: unknown): boolean {
  return normalizePageUrl(value) !== null;
}

/**
 * L'adresse telle qu'on accepte de la ranger, ou `null` si elle est refusée.
 *
 * `new URL` avec une base ne sert qu'à LIRE le protocole : la valeur rendue
 * reste la chaîne d'origine nettoyée, jamais l'URL absolutisée — un `/api/…`
 * doit rester relatif dans le document (cf. lib/page-files.ts).
 */
export function normalizePageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Blancs et caractères de contrôle : `java\tscript:` et `java\nscript:` sont
  // suivis par les navigateurs, et ne ressemblent à rien pour un test de
  // préfixe. Ils n’ont par ailleurs aucun sens dans une adresse.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0020\u007f]/g, "");
  if (!cleaned) return null;
  // Pas de protocole : une adresse relative. `//hôte/chemin` en porte un
  // implicitement (celui de la page) — il est donc http(s), donc acceptable.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) return cleaned;
  try {
    return SAFE_PROTOCOLS.has(new URL(cleaned).protocol) ? cleaned : null;
  } catch {
    return null;
  }
}

/* ── Les nœuds et les marques ─────────────────────────────────────────────── */

/**
 * Chaque nœud du schéma d'une page, avec ses attributs. Miroir exact du registre
 * (components/pages/blocks) plus le substrat de StarterKit, la mention et
 * l'`blockId` d'UniqueID — vérifié nœud par nœud par le test.
 */
export const PAGE_NODE_ATTRIBUTES: Record<string, readonly string[]> = {
  doc: [],
  paragraph: ["blockId"],
  text: [],
  hardBreak: [],
  heading: ["blockId", "level"],
  bulletList: ["blockId", "tight"],
  orderedList: ["blockId", "tight", "start", "type"],
  listItem: [],
  taskList: ["blockId", "tight"],
  taskItem: ["checked", "state"],
  blockquote: ["blockId"],
  codeBlock: ["blockId", "language"],
  horizontalRule: ["blockId"],
  details: ["blockId", "open"],
  detailsSummary: [],
  detailsContent: [],
  subpage: ["blockId", "pageId"],
  image: ["blockId", "src", "alt", "width", "uploadId"],
  pageFile: ["blockId", "src", "name", "size", "mime", "uploadId"],
  mention: [
    "mentionType",
    "mentionId",
    "mentionLabel",
    "seed",
    "color",
    "icon",
  ],
};

/** Les marques, même contrat que les nœuds. */
export const PAGE_MARK_ATTRIBUTES: Record<string, readonly string[]> = {
  link: ["href", "target", "rel", "class", "title"],
  bold: [],
  italic: [],
  strike: [],
  underline: [],
  code: [],
  pageTextColor: ["color"],
  pageBackgroundColor: ["color"],
};

/* ── La validation ────────────────────────────────────────────────────────── */

/** Pourquoi un corps est refusé. `unknown-node` couvre aussi les marques : du
    point de vue de l'auteur, c'est le même « ce bloc n'existe pas ici ». */
export type PageContentRefusal = "unknown-node" | "unsafe-url";

export type PageContentCheck =
  | { ok: true; content: unknown }
  | { ok: false; reason: PageContentRefusal };

/**
 * Le corps tel qu'on accepte de l'écrire.
 *
 * Rend une COPIE quand quelque chose a été retiré, jamais l'objet d'entrée
 * modifié en place : l'appelant garde ce qu'il a reçu, et la comparaison
 * « le corps a-t-il changé ? » de l'historique reste vraie.
 *
 * La descente est récursive, et elle peut l'être : la profondeur est bornée
 * avant (lib/json-depth.ts, MIN-348), c'est précisément l'ordre que ce
 * garde-fou-là impose.
 */
export function checkPageContent(value: unknown): PageContentCheck {
  try {
    return { ok: true, content: walk(value, true) };
  } catch (err) {
    if (err instanceof PageContentError) return { ok: false, reason: err.reason };
    throw err;
  }
}

class PageContentError extends Error {
  constructor(readonly reason: PageContentRefusal) {
    super(reason);
  }
}

function walk(value: unknown, isRoot: boolean): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const node = value as Record<string, unknown>;

  const type = node.type;
  if (type !== undefined) {
    if (typeof type !== "string" || !(type in PAGE_NODE_ATTRIBUTES)) {
      throw new PageContentError("unknown-node");
    }
    // La racine est un DOCUMENT, et rien d'autre : accepter un `paragraph` nu
    // ferait un corps que l'éditeur refuse de charger — un document qu'on ne
    // peut plus ouvrir vaut moins qu'une écriture refusée.
    if (isRoot && type !== "doc") throw new PageContentError("unknown-node");
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === "attrs") {
      out.attrs = readAttrs(child, typeof type === "string" ? type : null);
    } else if (key === "marks") {
      out.marks = readMarks(child);
    } else if (key === "content" && Array.isArray(child)) {
      out.content = child.map((item) => walk(item, false));
    } else {
      out[key] = child;
    }
  }
  return out;
}

function readAttrs(value: unknown, type: string | null): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const allowed = type ? PAGE_NODE_ATTRIBUTES[type] : null;
  return filterAttrs(value as Record<string, unknown>, allowed);
}

function readMarks(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((mark) => {
    if (!mark || typeof mark !== "object" || Array.isArray(mark)) return mark;
    const record = mark as Record<string, unknown>;
    const type = record.type;
    if (typeof type !== "string" || !(type in PAGE_MARK_ATTRIBUTES)) {
      throw new PageContentError("unknown-node");
    }
    const attrs = record.attrs;
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return record;
    return {
      ...record,
      attrs: filterAttrs(
        attrs as Record<string, unknown>,
        PAGE_MARK_ATTRIBUTES[type]
      ),
    };
  });
}

function filterAttrs(
  attrs: Record<string, unknown>,
  allowed: readonly string[] | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (allowed && !allowed.includes(key)) continue;
    if (URL_ATTRIBUTES.has(key) && value !== null && value !== undefined) {
      const url = normalizePageUrl(value);
      if (url === null) throw new PageContentError("unsafe-url");
      out[key] = url;
      continue;
    }
    out[key] = value;
  }
  return out;
}
