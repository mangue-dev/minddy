// The threads of a page in its right margin (MIN-1002) — the pure half:
// whether the pane has room for them, and where each card stands.
//
// Nothing from the DOM: boxes come in as numbers, positions go out, so the
// two rules that cannot be judged by eye on one screen size are tested as
// they are (lib/page-comment-margin.test.ts).

/** The strip beside the text kept for the hovered block's comment button. */
export const MARGIN_LANE = 44;
/** What a card keeps, at least, between itself and the pane's edge. */
export const MARGIN_EDGE = 24;
/** Below this a thread does not read: the page keeps its badges and popover. */
export const MARGIN_MIN_WIDTH = 240;
export const MARGIN_MAX_WIDTH = 304;
/** The text gives up width to make room for the cards, down to this. */
export const MARGIN_MIN_TEXT = 640;
/** The gap between two cards pushed against each other. */
export const MARGIN_CARD_GAP = 8;

export interface MarginLayout {
  /** The width of a card. */
  width: number;
  /** How far the text moves left while cards are shown. */
  shift: number;
  /** The width the text narrows to while cards are shown, when it must. */
  text: number | null;
}

/**
 * The margin of a pane `pane` pixels wide around a centred text `text` pixels
 * wide, or null when the cards do not fit.
 *
 * The cards stand a lane away from the text, not against the pane's edge:
 * the text and its cards are centred together, so the text moves left by half
 * of what the cards add. It never moves into `gutter`, the strip on its left
 * that holds the block handles; in a pane too narrow to centre both, the text
 * stops at the gutter and the cards take what is left. In a pane too narrow
 * for that too, the text narrows to leave the cards their smallest width, as
 * long as it stays readable itself.
 */
export function marginLayout(pane: number, text: number, gutter: number): MarginLayout | null {
  // What the text and a card share, once the gutter, lane and edge are kept.
  const room = Math.floor(pane - gutter - MARGIN_LANE - MARGIN_EDGE);
  const narrowed = room - text < MARGIN_MIN_WIDTH;
  const column = narrowed ? room - MARGIN_MIN_WIDTH : text;
  if (column < Math.min(text, MARGIN_MIN_TEXT)) return null;
  const width = Math.min(room - column, MARGIN_MAX_WIDTH);
  const shift = Math.min((pane - column) / 2 - gutter, (MARGIN_LANE + width) / 2);
  return { width, shift: Math.max(0, Math.round(shift)), text: narrowed ? column : null };
}

export interface MarginCardBox {
  id: string;
  /** Where the card wants to stand: the top of its block. */
  top: number;
  height: number;
}

/**
 * Where each card stands. A card starts level with its block; two cards
 * that would overlap are pushed apart, the lower one going down. The card
 * that is open keeps its place beside its text: the cards above it move up
 * instead, and the ones below follow it. Cards never climb above `floor`,
 * the top of the document's body: when the ones above have no room left to
 * move up, the open card goes down with the rest.
 */
export function layoutMarginCards(
  boxes: readonly MarginCardBox[],
  activeId: string | null = null,
  floor = Number.NEGATIVE_INFINITY,
  gap = MARGIN_CARD_GAP
): Map<string, number> {
  const cards = [...boxes].sort((a, b) => a.top - b.top);
  const tops = cards.map((card) => card.top);
  const below = (index: number) => tops[index - 1] + cards[index - 1].height + gap;
  const pushDown = (from: number) => {
    for (let index = Math.max(from, 1); index < cards.length; index += 1) {
      tops[index] = Math.max(cards[index].top, below(index));
    }
  };
  pushDown(1);
  const active = cards.findIndex((card) => card.id === activeId);
  if (active > 0 && tops[active] > cards[active].top) {
    tops[active] = cards[active].top;
    for (let index = active - 1; index >= 0; index -= 1) {
      tops[index] = Math.min(tops[index], tops[index + 1] - gap - cards[index].height);
    }
    const limit = Math.min(floor, cards[0].top);
    if (tops[0] < limit) {
      tops[0] = limit;
      for (let index = 1; index <= active; index += 1) tops[index] = Math.max(tops[index], below(index));
    }
    pushDown(active + 1);
  }
  return new Map(cards.map((card, index) => [card.id, tops[index]]));
}
