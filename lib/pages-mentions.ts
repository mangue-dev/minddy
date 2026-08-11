// QUI est cité dans une page, et dans quel bloc (MIN-278).
//
// Le nœud de mention est monté dans l'éditeur de page depuis MIN-273, et écrire
// « @Clément peux-tu trancher ça » n'y prévenait personne — alors que la même
// phrase dans un commentaire de ticket, oui. Ce module est la moitié PURE du
// rattrapage : le document entre, les citations sortent. Rien de la base, rien
// de tiptap — donc testable telle quelle (lib/pages-mentions.test.ts).
//
// ─── Pourquoi on relit le TEXTE, et pas les nœuds ────────────────────────────
//
// Parce que c'est le contrat des mentions de minddy : ce qui est stocké est du
// texte, « @Nom », et la pilule s'en re-déduit à la relecture (cf.
// components/mention-node.ts et l'architecture des mentions). Une mention TAPÉE
// à la main, sans passer par le sélecteur, n'est donc pas un nœud — et elle
// compte tout autant. On aplatit le bloc en texte (un nœud de mention rend son
// « @libellé », comme `renderText`), puis on passe le scanner commun
// (lib/mention-scan.ts). Une seule règle de ce qui EST une mention, partagée
// avec le champ de saisie : c'est ce qui garantit que la pilule affichée et la
// personne prévenue désignent bien le même compte.
//
// ─── Pourquoi par BLOC ───────────────────────────────────────────────────────
//
// Pour que le clic sur la notification tombe sur le paragraphe, et pas en tête
// d'un document de trois écrans. L'ancre existe déjà (`blockLink`,
// components/pages/block-actions.ts), et la page la suit à l'ouverture.

import { contentMentionScanner } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

/** L'attribut qui porte l'ID stable d'un bloc — la même chaîne que
    `BLOCK_ID_ATTRIBUTE` (components/pages/blocks/types.ts), recopiée ici plutôt
    qu'importée : ce module doit rester montable hors navigateur, et le registre
    de blocs tire tiptap. Le test le vérifie contre la source. */
export const PAGE_BLOCK_ID_ATTRIBUTE = "blockId";

interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: DocNode[] | null;
}

/** Le texte d'un nœud et de sa descendance, mentions comprises. */
function textOf(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  // Un nœud de mention est ATOMIQUE : il n'a pas d'enfant texte, son libellé
  // vit dans ses attributs. Sans cette branche, une mention posée au sélecteur
  // — le cas le plus courant — serait invisible au scanner.
  if (node.type === "mention") {
    const label = node.attrs?.mentionLabel;
    return typeof label === "string" && label ? `@${label}` : "";
  }
  if (!Array.isArray(node.content)) return "";
  // Un espace entre les enfants : deux blocs collés ne doivent pas fabriquer un
  // nom qui n'a jamais été écrit (« @Jean » + « Marc » ≠ « @Jean Marc »).
  return node.content.map(textOf).join(" ");
}

/** Un bloc de premier niveau, aplati : son id (quand il en a un) et son texte. */
export interface PageBlockText {
  blockId: string | null;
  text: string;
}

/**
 * Les blocs de premier niveau d'un document de page, aplatis.
 *
 * Premier niveau seulement : c'est là que vit l'id de bloc (l'ancre, la poignée,
 * la fusion par bloc de MIN-271 s'y accrochent toutes). Une mention écrite dans
 * une puce remonte donc à l'id de la liste, ce qui est la bonne granularité —
 * c'est le bloc que le lien de bloc sait viser.
 */
export function pageBlockTexts(doc: unknown): PageBlockText[] {
  const blocks = (doc as DocNode | null)?.content;
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block) => {
    const id = block.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    return {
      blockId: typeof id === "string" && id ? id : null,
      text: textOf(block),
    };
  });
}

/** Une citation à prévenir : qui, et où. */
export interface PageMention {
  userId: string;
  /** Le bloc où la citation a été trouvée, `null` quand il n'a pas d'id. */
  blockId: string | null;
}

/** Les comptes cités dans un document, avec le PREMIER bloc qui les cite. */
function mentionsIn(doc: unknown, members: Member[]): Map<string, string | null> {
  const scan = contentMentionScanner({ members });
  const found = new Map<string, string | null>();
  for (const block of pageBlockTexts(doc)) {
    if (!block.text.includes("@")) continue;
    for (const segment of scan(block.text)) {
      if (segment.mention?.type !== "member") continue;
      const userId = segment.mention.member.user_id;
      // Le PREMIER bloc gagne : citer deux fois la même personne ne doit pas
      // faire dépendre la destination du hasard de l'ordre d'itération.
      if (!found.has(userId)) found.set(userId, block.blockId);
    }
  }
  return found;
}

/**
 * Qui vient d'être cité dans une page, et mérite donc d'être prévenu.
 *
 * Trois règles, les mêmes que pour une description de ticket
 * (lib/server/description-mentions.ts) — c'est le point : une mention se
 * comporte pareil partout.
 *
 *  1. ACCÈS. `members` est la liste des gens qui ONT accès au projet ; un nom
 *     qui n'y figure pas ne notifie personne.
 *  2. JAMAIS SOI-MÊME. Se citer dans sa propre page n'est pas un appel.
 *  3. LES NOUVELLES SEULEMENT. On compare au document PRÉCÉDENT et on ne
 *     prévient que les arrivants. Sans ça, l'éditeur enregistrant une seconde
 *     après la dernière frappe, corriger une virgule dix lignes plus bas
 *     repingerait toute la page — et c'est la règle qui tient tout le débit :
 *     une rafale d'autosaves ne notifie qu'à la sauvegarde où le nom apparaît.
 *
 * `previousDoc` absent = création : tout ce qui est cité est nouveau.
 */
export function newPageMentions(params: {
  members: Member[];
  doc: unknown;
  previousDoc?: unknown;
  actorId: string | null;
}): PageMention[] {
  const before = params.previousDoc
    ? mentionsIn(params.previousDoc, params.members)
    : new Map<string, string | null>();

  const out: PageMention[] = [];
  for (const [userId, blockId] of mentionsIn(params.doc, params.members)) {
    if (userId === params.actorId) continue;
    if (before.has(userId)) continue;
    out.push({ userId, blockId });
  }
  return out;
}
