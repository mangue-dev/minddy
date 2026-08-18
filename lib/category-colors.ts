import type { MessageKey } from "@/lib/i18n-keys";

// Fixed label palette — categories pick from these (predictable, "label"-like,
// not a free color picker). Values are plain hex so they render in <span style>.
export const CATEGORY_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // violet
  "#ec4899", // pink
  "#6b7280", // gray
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[9];

/**
 * Color of a category created on the fly from a picker (MIN — quick addition
 *): drawn at random FROM THOSE THAT THE PROJECT IS NOT YET USING.
 * Quick addition does not require a color, and a gray by default would make the
 * labels indistinguishable; as long as there is a choice, two neighboring categories
 * therefore never come out of the same tablet. Palette exhausted: au
 * random in the entire palette (we recolor in the settings).
 */
export function pickFreeCategoryColor(used: Iterable<string>): string {
  const taken = new Set(used);
  const free = CATEGORY_COLORS.filter((color) => !taken.has(color));
  const pool: readonly string[] = free.length > 0 ? free : CATEGORY_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** hex → translated name key (namespace `Categories.colors`). Used for the labels
 as a screen reader for the pastilles, which announced the raw hex. */
export const CATEGORY_COLOR_NAMES: Record<string, MessageKey<"Categories.colors">> = {
  "#ef4444": "red",
  "#f97316": "orange",
  "#eab308": "amber",
  "#22c55e": "green",
  "#14b8a6": "teal",
  "#3b82f6": "blue",
  "#6366f1": "indigo",
  "#a855f7": "violet",
  "#ec4899": "pink",
  "#6b7280": "gray",
};

const HEX = /^#[0-9a-fA-F]{6}$/;
export function isValidColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}
