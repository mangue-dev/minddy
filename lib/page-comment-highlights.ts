import type { Node } from "@tiptap/pm/model";

export interface PageCommentHighlightRange {
  from: number;
  to: number;
}

interface CharacterPosition {
  value: string;
  from: number | null;
  to: number | null;
}

/**
 * Flatten a block while retaining the document position of every character.
 * Synthetic spaces keep separate child blocks readable in the same way as a
 * frozen comment quote, but are never decorated themselves.
 */
function blockCharacters(block: Node, blockPos: number): CharacterPosition[] {
  const characters: CharacterPosition[] = [];

  const visit = (node: Node, pos: number) => {
    if (node.isText) {
      for (let index = 0; index < (node.text?.length ?? 0); index += 1) {
        characters.push({
          value: node.text?.[index] ?? "",
          from: pos + index,
          to: pos + index + 1,
        });
      }
      return;
    }

    node.forEach((child, childOffset, index) => {
      if (index > 0 && child.isBlock) {
        characters.push({ value: " ", from: null, to: null });
      }
      visit(child, pos + 1 + childOffset);
    });
  };

  visit(block, blockPos);
  return characters;
}

/** Collapse whitespace exactly like stored page-comment quotes. */
function normalizedCharacters(
  characters: CharacterPosition[]
): CharacterPosition[] {
  const normalized: CharacterPosition[] = [];
  for (const character of characters) {
    if (/\s/.test(character.value)) {
      const previous = normalized.at(-1);
      if (previous?.value === " ") {
        if (character.from !== null) {
          previous.from ??= character.from;
          previous.to = character.to;
        }
        continue;
      }
      normalized.push({ ...character, value: " " });
      continue;
    }
    normalized.push(character);
  }
  while (normalized[0]?.value === " ") normalized.shift();
  while (normalized.at(-1)?.value === " ") normalized.pop();
  return normalized;
}

/**
 * A quote as it is searched in the block's collapsed text. A comment that was
 * just posted still carries the line breaks and indentation of its selection
 * (a code block), and a long one was cut with an ellipsis the text never had.
 */
function searchableQuote(quote: string): string {
  return quote.replace(/\s+/g, " ").trim().replace(/…$/, "").trimEnd();
}

/**
 * The text of a whole block, as inline ranges: one per non-empty text block
 * it holds, through its containers (lists, a callout, a toggle). A block
 * with no text (a divider, an image, an equation) has none.
 */
export function pageBlockContentRanges(block: Node, blockPos: number): PageCommentHighlightRange[] {
  const ranges: PageCommentHighlightRange[] = [];
  const visit = (node: Node, pos: number) => {
    if (node.isTextblock) {
      if (node.content.size > 0) ranges.push({ from: pos + 1, to: pos + 1 + node.content.size });
      return;
    }
    node.forEach((child, offset) => visit(child, pos + 1 + offset));
  };
  visit(block, blockPos);
  return ranges;
}

/**
 * Resolve frozen excerpts back to inline document ranges. Quotes that no
 * longer occur are intentionally ignored: stale comments still mark the block,
 * but must not underline unrelated text after an edit.
 */
export function pageCommentHighlightRanges(
  block: Node,
  blockPos: number,
  quotes: readonly string[]
): PageCommentHighlightRange[] {
  const characters = normalizedCharacters(blockCharacters(block, blockPos));
  const text = characters.map((character) => character.value).join("");
  const ranges: PageCommentHighlightRange[] = [];

  for (const quote of new Set(quotes.map(searchableQuote).filter(Boolean))) {
    let searchFrom = 0;
    while (searchFrom <= text.length - quote.length) {
      const match = text.indexOf(quote, searchFrom);
      if (match < 0) break;
      const matched = characters.slice(match, match + quote.length);
      let current: PageCommentHighlightRange | null = null;
      for (const character of matched) {
        if (character.from === null || character.to === null) {
          current = null;
          continue;
        }
        if (current && current.to === character.from) {
          current.to = character.to;
        } else {
          current = { from: character.from, to: character.to };
          ranges.push(current);
        }
      }
      searchFrom = match + Math.max(quote.length, 1);
    }
  }

  return ranges;
}

/** Whether a frozen excerpt still reads in its block, so the page shows it. */
export function pageCommentQuoteInBlock(block: Node, quote: string | null | undefined): boolean {
  const text = quote?.trim();
  return !!text && pageCommentHighlightRanges(block, 0, [text]).length > 0;
}
