/**
 * A feature card's illustration fades out at the card's edges, as the mention
 * preview cards do, so it can run past them. Most run off to the right and
 * the bottom; an illustration anchored on its right side (a pill whose button
 * is on the right, a card enlarged on its top right corner) fades on the left.
 */
export const CARD_FADE =
  "[mask-image:linear-gradient(to_right,black_62%,transparent),linear-gradient(to_bottom,black_52%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in]";

export const CARD_FADE_LEFT =
  "[mask-image:linear-gradient(to_left,black_62%,transparent),linear-gradient(to_bottom,black_52%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in]";

/** Only toward the bottom: a list that goes on past the card. */
export const CARD_FADE_BOTTOM = "[mask-image:linear-gradient(to_bottom,black_45%,transparent)]";

/** On both sides and toward the bottom: rows that run past the card on the left and the right. */
export const CARD_FADE_SIDES =
  "[mask-image:linear-gradient(to_right,transparent,black_18%,black_70%,transparent),linear-gradient(to_bottom,black_55%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in]";

/** Only on the right: a chart whose lines keep going past the card. */
export const CARD_FADE_RIGHT = "[mask-image:linear-gradient(to_right,black_70%,transparent)]";
