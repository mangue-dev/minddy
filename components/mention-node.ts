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
// What is STORED (MIN-734): a typed link, `[@Label](mention:issue/<id>)`
// (lib/mention-link.ts), so the reference survives renames, homonyms and
// copy-paste. `@Numo` and forge logins stay plain `@text`, which their
// readers resolve themselves. Older `@Label` text is still re-deduced by
// lib/mention-scan and written back as a link by the next save.

import { Node } from "@tiptap/core";
import {
  isMentionLinkType,
  mentionHref,
  mentionMarkdown,
  parseMentionHref,
} from "@/lib/mention-link";

/**
 * The link of a node, when it is a typed reference: not Numo, not a forge
 * login, and not a pill rebuilt from older `@Label` text (`legacy`). Such a
 * pill was found by its label, not picked: writing it back as a typed link
 * would turn a label match into an identity, and would change the text of a
 * live document on a mere read, which the server refuses for presentation.
 */
function typedHref(attrs: Record<string, unknown>): string | null {
  if (attrs.legacy) return null;
  const type = attrs.mentionType;
  const id = attrs.mentionId;
  return isMentionLinkType(type) && typeof id === "string" && id ? mentionHref(type, id) : null;
}

/** The attributes that a statement carries. They are enough to redraw
 without resolving anything — a ⌘Z cancellation restores the node as it is. */
export const MENTION_ATTRS = [
  "mentionType",
  "mentionId",
  "mentionLabel",
  "seed",
  "color",
  "icon",
  "status",
  /** Rebuilt from `@Label` text rather than picked: written back as text. */
  "legacy",
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
        // The stored link, as markdown-it renders it, and the anchor a copied
        // pill carries. Ahead of the link mark, which would take it as a link.
        tag: "a[href^=\"mention:\"]",
        priority: 100,
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const target = parseMentionHref(node.getAttribute("href"));
          if (!target) return false;
          return {
            mentionType: target.type,
            mentionId: target.id,
            mentionLabel: (node.textContent ?? "").replace(/^@/, ""),
            seed: node.dataset.mentionSeed ?? null,
            color: node.dataset.mentionColor ?? null,
            icon: node.dataset.mentionIcon ?? null,
            status: node.dataset.mentionStatus ?? null,
          };
        },
      },
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
            status: node.dataset.mentionStatus ?? null,
            legacy: node.dataset.mentionLegacy === "true" ? true : null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const href = typedHref(node.attrs);
    return [
      // An anchor for a typed reference: copied HTML keeps it, and every
      // editor parses it back (above).
      href ? "a" : "span",
      {
        ...(href ? { href } : {}),
        "data-mention-type": node.attrs.mentionType,
        "data-mention-id": node.attrs.mentionId,
        "data-mention-label": node.attrs.mentionLabel,
        ...(node.attrs.seed ? { "data-mention-seed": node.attrs.seed } : {}),
        ...(node.attrs.color ? { "data-mention-color": node.attrs.color } : {}),
        ...(node.attrs.icon ? { "data-mention-icon": node.attrs.icon } : {}),
        ...(node.attrs.status ? { "data-mention-status": node.attrs.status } : {}),
        ...(node.attrs.legacy ? { "data-mention-legacy": "true" } : {}),
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
          const { mentionType: type, mentionId: id, mentionLabel: label } = node.attrs;
          state.text(typedHref(node.attrs) && isMentionLinkType(type)
            ? mentionMarkdown(type, id, label ?? "")
            : `@${label}`, false);
        },
        parse: {},
      },
    };
  },
});
