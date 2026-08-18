// The NODE of mention, without a line of React: the schema, its attributes, and its
// markdown serialization. The pill (components/markdown-mention.tsx) is grafted
  // on top through an `addNodeView`.
//
// This breakdown is that of the notebook tasks (components/scratchpad/task-nodes.ts),
// and for the same reason: the markdown projection of pages (lib/pages-markdown.ts)
// must UP this node to read a document that contains one, and it spins
// outside browser. A node exported from a “use client” module does not arrive there
// as is — on the server side, such a module only renders client references.
//
// Reminder of the contract (see markdown-mention.tsx): what is STORED is text,
// “@Nom” / “@MIN-42”, and the pill is re-deduced upon rereading by
// lib/mention-scan. The knot is only a garment; markdown loses nothing.

import { Node } from "@tiptap/core";

/** The attributes that a statement carries. They are enough to redraw
 without resolving anything — a ⌘Z cancellation restores the node as it is. */
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
  // Unbreakable: the caret does not fit in, and a backspace erases it
  // in one block — like the pill of a comment.
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

  /** What a plain text copy carries — including the at sign. */
  renderText({ node }) {
    return `@${node.attrs.mentionLabel}`;
  },

  addStorage() {
    return {
      markdown: {
        // `false`: no escape. A label that contains a star or a
        // underlined must leave AS IS — it is on him that the scanner
        // will find the mention on rereading, and “Jean\*Marc” would no longer be
        // the person's name.
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
