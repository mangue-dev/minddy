/**
 * Where the caret of a WRAPPING textarea sits on screen (MIN-756).
 *
 * A title is a textarea that folds a long text over two or three lines. To
 * move between it and the description below as between two lines of one
 * text, ↓ must know whether the caret is on the last folded line, and the
 * caret must land at about the same x in both directions. The DOM says
 * neither, so the field is copied into an invisible mirror with the same
 * typography and width, one span per character, and each span is measured.
 *
 * The pure half (which positions share the last line, which one is closest
 * to an x) is separate from the measurement, which only answers in a browser.
 */

/** A caret position in viewport coordinates: the left edge of the character
    that follows it, and the top of its line. */
export interface CaretPoint {
  left: number;
  top: number;
}

/** Positions whose top is within `tolerance` of the lowest line. */
function onLastLine(points: CaretPoint[], tolerance: number): (point: CaretPoint) => boolean {
  const last = Math.max(...points.map((point) => point.top));
  return (point) => point.top > last - tolerance;
}

/** Is the caret position `index` on the last line? `tolerance` is about half
    a line: two positions on one line share their top to the pixel. */
export function isOnLastLine(points: CaretPoint[], index: number, tolerance: number): boolean {
  const point = points[index];
  if (!point) return false;
  return onLastLine(points, tolerance)(point);
}

/** The caret position of the last line closest to `x`. */
export function nearestOnLastLine(points: CaretPoint[], x: number, tolerance: number): number {
  const last = onLastLine(points, tolerance);
  let best = points.length - 1;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    if (!last(point)) return;
    const gap = Math.abs(point.left - x);
    if (gap < distance) {
      best = index;
      distance = gap;
    }
  });
  return best;
}

// What decides where a character falls: everything that changes its width
// or where the line wraps.
const MIRRORED = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontFeatureSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textTransform",
  "tabSize",
] as const;

/**
 * Every caret position of the field (`value.length + 1` of them), with the
 * line tolerance. `null` without layout (a test DOM, a hidden field): callers
 * then fall back on what they can be sure of, the end of the text.
 */
export function measureCaretPoints(
  field: HTMLTextAreaElement,
): { points: CaretPoint[]; tolerance: number } | null {
  const rect = field.getBoundingClientRect();
  if (rect.width === 0) return null;
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const property of MIRRORED) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: style.wordBreak,
  });
  const spans = [...field.value, "​"].map((character) => {
    const span = document.createElement("span");
    span.textContent = character;
    mirror.append(span);
    return span;
  });
  document.body.append(mirror);
  try {
    const origin = mirror.getBoundingClientRect();
    const points = spans.map((span) => {
      const box = span.getBoundingClientRect();
      return {
        left: rect.left + box.left - origin.left - field.scrollLeft,
        top: rect.top + box.top - origin.top - field.scrollTop,
      };
    });
    const height = spans[spans.length - 1]!.getBoundingClientRect().height;
    if (height === 0) return null;
    return { points, tolerance: height / 2 };
  } finally {
    mirror.remove();
  }
}

/** Is the (collapsed) caret on the last folded line of the field? Without
    layout, only the end of the text is sure to be there. */
export function caretOnLastLine(field: HTMLTextAreaElement): boolean {
  if (field.selectionStart !== field.selectionEnd) return false;
  const caret = field.selectionEnd;
  if (caret === field.value.length) return true;
  const measured = measureCaretPoints(field);
  if (!measured) return false;
  return isOnLastLine(measured.points, caret, measured.tolerance);
}

/** The caret's x in the viewport, or `undefined` without layout. */
export function caretLeft(field: HTMLTextAreaElement): number | undefined {
  return measureCaretPoints(field)?.points[field.selectionEnd]?.left;
}

/**
 * Focus the field on its last line, at about `x` — the end of the text when
 * `x` is absent (⌫ from the body) or nothing can be measured.
 */
export function focusLastLine(field: HTMLTextAreaElement, x?: number) {
  field.focus();
  let index = field.value.length;
  if (x !== undefined) {
    const measured = measureCaretPoints(field);
    if (measured) index = nearestOnLastLine(measured.points, x, measured.tolerance);
  }
  field.setSelectionRange(index, index);
}
