/**
 * La PROJECTION markdown d'une page — dans les deux sens (MIN-269).
 *
 * Le corps d'une page est stocké en JSON ProseMirror, parce que c'est ce
 * qu'exige un éditeur par blocs avec ID stables, poignée et glisser-déposer.
 * Mais un agent ne lit pas du JSON ProseMirror : il lit du markdown, et lire et
 * écrire les pages depuis Numo est l'argument central de la feature. Le JSON est
 * donc le STOCKAGE, le markdown la projection — pour le MCP (MIN-273), l'agent
 * de code et les exports.
 *
 * La règle : **un aller-retour ne perd jamais de CONTENU.** Seulement de la
 * présentation, et seulement là où c'est écrit ci-dessous.
 *
 * ## Les pertes assumées
 *
 * | Ce qui tombe | Pourquoi | Ce qui reste |
 * | --- | --- | --- |
 * | La couleur d'un passage (texte et fond) | Markdown n'a pas de couleur. La mark est retirée à l'écriture plutôt que recopiée en `<span>` : une perte franche vaut mieux qu'une balise au milieu de ce que lit Numo (cf. blocks/color.ts) | Le texte, mot pour mot |
 * | L'état PLIÉ d'un dépliant (`open`) | `<details>` porte l'attribut, mais c'est un état de lecture, propre à qui regarde, pas du contenu | Le résumé et le corps replié |
 * | La pilule d'une mention | Une mention EST du texte (`@Nom`, `@MIN-42`) — le nœud n'est qu'un habit, reposé à la relecture par lib/mention-scan | `@Nom`, à la lettre |
 * | L'ID de bloc (`blockId`) | Il n'a de sens qu'à l'intérieur d'un document ; un markdown venu de Numo n'en porte pas | Un ID NEUF, posé à la relecture (`stampBlockIds`) |
 * | Le titre d'une sous-page | Il n'est jamais recopié dans le corps du parent, par construction : il est résolu à l'affichage (cf. blocks/subpage.ts) | `[[page:<id>]]`, donc la cible |
 * | La LARGEUR d'une image | `![…](…)` n'a pas d'attribut. La largeur est un réglage d'affichage — combien de colonne l'image occupe —, jamais du contenu (cf. blocks/image.ts) | L'image, à sa largeur par défaut |
 * | Le POIDS et le type d'un fichier | Un lien markdown ne porte que son texte et son adresse. Ce sont deux indications de confort, relisibles de `page_files` : le nom et le fichier lui-même, eux, sont là | `[nom](url)`, donc le fichier |
 *
 * La LÉGENDE d'une image, elle, ne tombe PAS, et c'est un choix : elle est le
 * texte alternatif (`![légende](…)`), un seul champ pour les deux. Une bonne
 * légende est un bon texte alternatif — en garder deux dans le nœud aurait voulu
 * dire en perdre un à chaque aller-retour.
 *
 * Tout le reste — titres, listes, tâches et leurs quatre états, imbrication,
 * citation, code, séparateur, dépliant, sous-page, gras/italique/code/lien —
 * revient identique, et lib/pages-markdown.test.ts le joue bloc par bloc, en
 * PARCOURANT le registre : un bloc ajouté sans sa projection fait tomber la suite.
 *
 * ## Ce que ce module suppose
 *
 * Un DOM global (`window.DOMParser`) : tiptap-markdown lit le markdown en
 * passant par du HTML. Dans un navigateur et sous jsdom, il est là. Ailleurs —
 * une fonction serveur, l'outil MCP de MIN-273 — c'est à l'appelant de
 * l'installer avant le premier appel. C'est une contrainte connue et écrite,
 * pas une surprise.
 */

import { Editor, type JSONContent } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
} from "@/components/pages/blocks";

/** Une page telle que la projection la voit : son en-tête, et son corps. */
export interface PageProjection {
  title: string;
  /** Emoji, ou `null` quand la page prend l'icône par défaut. */
  icon: string | null;
  /** Le document ProseMirror. `null` pour une page vide. */
  content: JSONContent | null;
}

/**
 * L'emoji en tête du titre. `Extended_Pictographic` couvre les émojis d'un seul
 * point de code, la séquence `‍` les composés (« 👩‍💻 »), et `️` le
 * sélecteur de présentation ; les drapeaux (deux indicateurs régionaux) et les
 * touches (« 1️⃣ ») ont leur propre branche. Un titre qui COMMENCE par un émoji
 * sans en être un — « 🎉 la sortie » — perdrait le sien à la relecture : c'est le
 * prix d'un en-tête qui tient sur une ligne, et l'icône est de toute façon
 * choisie dans un sélecteur, jamais tapée dans le titre.
 */
const ICON_PREFIX =
  /^(?:\p{RI}\p{RI}|[0-9#*]️?⃣|\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s+/u;

/** L'en-tête : `# 📘 Titre`. Le titre et l'icône ne sont pas dans le corps (ce
    sont deux colonnes), mais Numo doit recevoir la page en UN SEUL morceau. */
const HEAD = /^#[ \t]+(.*)$/;

/* ── Le sens ÉCRITURE : JSON → markdown ───────────────────────────────── */

/**
 * La page en markdown, en-tête compris.
 *
 * Le corps est sérialisé par le registre : ce fichier ne connaît aucun bloc
 * nommément, et n'en connaîtra jamais. Chaque descripteur porte son
 * `toMarkdown` (ou s'en remet à celui de son nœud), le registre le greffe, et
 * ajouter un bloc tableau ne touchera pas une ligne d'ici.
 */
export function pageToMarkdown(page: PageProjection): string {
  const head = headLine(page);
  const body = bodyToMarkdown(page.content);
  if (!head) return body;
  return body ? `${head}\n\n${body}` : head;
}

function headLine({ title, icon }: PageProjection): string {
  const trimmed = title.trim();
  if (!trimmed && !icon) return "";
  return `# ${icon ? `${icon} ` : ""}${trimmed}`.trimEnd();
}

/** Le corps seul — ce que voit une surface qui a déjà le titre par ailleurs. */
export function bodyToMarkdown(content: JSONContent | null | undefined): string {
  if (!content) return "";
  const editor = pageEditor(content);
  try {
    return markdownOf(editor).trim();
  } finally {
    editor.destroy();
  }
}

/* ── Le sens LECTURE : markdown → JSON ────────────────────────────────── */

/**
 * Le markdown d'une page, relu en page.
 *
 * L'en-tête est CONSOMMÉ : un titre de niveau 1 en tête du document devient le
 * titre de la page, son émoji de tête son icône. C'est ce qui permet à Numo
 * d'écrire une page entière d'un seul jet — et c'est aussi pourquoi un corps
 * qui commence par un `# ` voit sa première ligne remonter dans le titre. Les
 * niveaux 2 et 3 restent du corps, eux.
 */
export function markdownToPage(markdown: string): PageProjection {
  const { title, icon, body } = splitHead(markdown);
  return { title, icon, content: bodyFromMarkdown(body) };
}

/** Le corps seul — le pendant de `bodyToMarkdown`. */
export function bodyFromMarkdown(markdown: string): JSONContent {
  const editor = pageEditor(markdown);
  try {
    return stampBlockIds(editor.getJSON());
  } finally {
    editor.destroy();
  }
}

/**
 * Donner son ID stable à chaque bloc qui n'en a pas.
 *
 * `UniqueID` est bien monté (c'est lui qui met l'attribut au schéma, donc qui
 * empêche un `blockId` existant d'être jeté à la relecture d'un JSON), mais il
 * ne le POSE qu'au tick suivant la création de l'éditeur : tiptap émet `create`
 * dans un `setTimeout`. Une projection, elle, est synchrone et jette son éditeur
 * aussitôt — sans ce passage, une page écrite en markdown par Numo arriverait en
 * base avec des blocs sans identité, et la sauvegarde par bloc (MIN-271) comme
 * les ancres de lien n'auraient rien sur quoi se tenir.
 *
 * Les types viennent du registre (`BLOCK_ID_TYPES`) : un bloc neuf est identifié
 * d'office, ici comme dans l'éditeur.
 */
function stampBlockIds(json: JSONContent): JSONContent {
  const types = new Set(BLOCK_ID_TYPES);
  const walk = (node: JSONContent) => {
    if (node.type && types.has(node.type)) {
      const attrs = node.attrs ?? {};
      if (attrs[BLOCK_ID_ATTRIBUTE] == null) {
        node.attrs = { ...attrs, [BLOCK_ID_ATTRIBUTE]: newBlockId() };
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return json;
}

function newBlockId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  // jsdom ancien, contexte non sécurisé : un id de secours, unique de fait. Un
  // ID de bloc n'a de portée QUE dans son document.
  return `b-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function splitHead(markdown: string): {
  title: string;
  icon: string | null;
  body: string;
} {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first += 1;

  const head = first < lines.length ? HEAD.exec(lines[first]) : null;
  if (!head) return { title: "", icon: null, body: markdown.trim() };

  // Un `# titre` suivi immédiatement d'un `===` serait un titre setext, pas cet
  // en-tête — mais markdown-it lit d'abord le `#`, donc rien à démêler ici.
  const rest = head[1].trim();
  const emoji = ICON_PREFIX.exec(rest);
  return {
    title: (emoji ? rest.slice(emoji[0].length) : rest).trim(),
    icon: emoji ? emoji[0].trim() : null,
    body: lines.slice(first + 1).join("\n").trim(),
  };
}

/* ── Le montage ───────────────────────────────────────────────────────── */

/**
 * Un éditeur monté sur le schéma de la page, sans une ligne de React ni de vue
 * de nœud. C'est le MÊME schéma que l'éditeur (components/pages/page-extensions.ts) :
 * un bloc que l'un sait produire, l'autre sait le lire.
 *
 * L'éditeur est jetable — un par appel, détruit dans la foulée. Le garder
 * ouvert entre deux conversions ferait porter à la projection un état
 * (historique, sélection, plugins) dont elle n'a que faire, et rendrait deux
 * appels concurrents dépendants l'un de l'autre.
 */
function pageEditor(content: JSONContent | string): Editor {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: pageExtensions({ headless: true }),
  });
}

function markdownOf(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}
