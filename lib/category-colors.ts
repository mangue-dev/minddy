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

/** hex → clé de nom traduit (namespace `Categories.colors`). Sert aux libellés
    de lecteur d'écran des pastilles, qui annonçaient le hex brut. */
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
