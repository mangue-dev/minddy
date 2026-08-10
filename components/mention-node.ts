// Le NŒUD de mention, sans une ligne de React : le schéma, ses attributs, et sa
// sérialisation markdown. La pilule (components/markdown-mention.tsx) se greffe
// dessus par un `addNodeView`.
//
// Ce découpage est celui des tâches du carnet (components/scratchpad/task-nodes.ts),
// et pour la même raison : la projection markdown des pages (lib/pages-markdown.ts)
// doit MONTER ce nœud pour lire un document qui en contient un, et elle tourne
// hors navigateur. Un nœud exporté depuis un module « use client » n'y arrive pas
// tel quel — côté serveur, un tel module ne rend que des références de client.
//
// Rappel du contrat (cf. markdown-mention.tsx) : ce qui est STOCKÉ est du texte,
// « @Nom » / « @MIN-42 », et la pilule s'en re-déduit à la relecture par
// lib/mention-scan. Le nœud n'est qu'un habit ; le markdown, lui, ne perd rien.

import { Node } from "@tiptap/core";

/** Les attributs que porte une mention posée. Ils suffisent à la redessiner
    sans rien re-résoudre — une annulation ⌘Z restitue le nœud tel quel. */
export const MENTION_ATTRS = [
  "mentionType",
  "mentionId",
  "mentionLabel",
  "seed",
  "color",
  "icon",
] as const;

export const MentionNodeBase = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  // Insécable : le caret ne rentre pas dedans, et un retour arrière l'efface
  // d'un bloc — comme la pilule d'un commentaire.
  selectable: false,
  draggable: false,

  addAttributes() {
    return Object.fromEntries(
      MENTION_ATTRS.map((name) => [name, { default: null }])
    );
  },

  parseHTML() {
    return [
      {
        tag: "span[data-mention-id]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return {
            mentionType: node.dataset.mentionType ?? "member",
            mentionId: node.dataset.mentionId ?? null,
            mentionLabel: node.dataset.mentionLabel ?? "",
            seed: node.dataset.mentionSeed ?? null,
            color: node.dataset.mentionColor ?? null,
            icon: node.dataset.mentionIcon ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "span",
      {
        "data-mention-type": node.attrs.mentionType,
        "data-mention-id": node.attrs.mentionId,
        "data-mention-label": node.attrs.mentionLabel,
        ...(node.attrs.seed ? { "data-mention-seed": node.attrs.seed } : {}),
        ...(node.attrs.color ? { "data-mention-color": node.attrs.color } : {}),
        ...(node.attrs.icon ? { "data-mention-icon": node.attrs.icon } : {}),
      },
      `@${node.attrs.mentionLabel}`,
    ];
  },

  /** Ce qu'une copie en texte brut emporte — l'arobase comprise. */
  renderText({ node }) {
    return `@${node.attrs.mentionLabel}`;
  },

  addStorage() {
    return {
      markdown: {
        // `false` : pas d'échappement. Un libellé qui contient une étoile ou un
        // souligné doit repartir TEL QUEL — c'est sur lui que le scanner
        // retrouvera la mention à la relecture, et « Jean\*Marc » ne serait plus
        // le nom de personne.
        serialize(
          state: { text: (value: string, escape?: boolean) => void },
          node: { attrs: Record<string, string> },
        ) {
          state.text(`@${node.attrs.mentionLabel}`, false);
        },
        parse: {},
      },
    };
  },
});
