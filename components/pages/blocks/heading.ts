import { Heading } from "@tiptap/extension-heading";
import { Heading1, Heading2, Heading3 } from "lucide-react";
import type { PageBlock } from "@/components/pages/blocks/types";

/**
 * Three BLOCKS for a single NODE — this is the case which decided the form of the
 * descriptor: the catalog speaks in blocks ("title 2"), tiptap in nodes
 * (`heading` + one level). Only title 1 provides the extension; the other two
 * are added to it, and the register duplicates by extension name.
 *
 * Three levels, not six: beyond that, a title is no longer distinguishable from a
 * bold paragraph, and the notebook decided the same.
 */
const LEVELS = [1, 2, 3] as const;

function headingBlock(level: (typeof LEVELS)[number]): PageBlock {
  const icon = { 1: Heading1, 2: Heading2, 3: Heading3 }[level];
  return {
    // No casting: `level` is a literal union, so TypeScript infers
    // `"heading1" | "heading2" | "heading3"` — and would refuse a level 4, of which
    //neither the block identity nor the i18n keys exist.
    id: `heading${level}`,
    nodeName: "heading",
    extensions: level === 1 ? [Heading.configure({ levels: [...LEVELS] })] : [],
    icon,
    labelKey: `blockHeading${level}`,
    slash: {
      group: "basic",
      order: level,
      keywords: [
        "heading",
        "title",
        "titre",
        "section",
        `h${level}`,
        `#`.repeat(level),
      ],
    },
    turnInto: (editor) => editor.chain().focus().setNode("heading", { level }).run(),
    isActive: (editor) => editor.isActive("heading", { level }),
    shortcut: { keys: `Mod-Alt-${level}`, display: `⌘⌥${level}` },
    markdown: { sample: `${"#".repeat(level)} A heading` },
  };
}

export const heading1Block = headingBlock(1);
export const heading2Block = headingBlock(2);
export const heading3Block = headingBlock(3);
