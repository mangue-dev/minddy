/** Shared pastel surfaces for the public site's product, agent, and hosting cards. */
export const CARD_TONES = {
  sage: "bg-[#eaf0e5] text-[#263c2c] dark:bg-[#222e25] dark:text-[#dce8dc]",
  mint: "bg-[#e0efe8] text-[#1e4436] dark:bg-[#223330] dark:text-[#d7eae1]",
  lavender: "bg-[#f0ecf6] text-[#433352] dark:bg-[#2e2638] dark:text-[#e8dff2]",
  peach: "bg-[#f7ecdf] text-[#573e28] dark:bg-[#342b22] dark:text-[#f1e1ce]",
  sky: "bg-[#e6edf5] text-[#293d56] dark:bg-[#232e3c] dark:text-[#dce7f4]",
  rose: "bg-[#f5e7eb] text-[#583642] dark:bg-[#35262d] dark:text-[#f2dfe7]",
  butter: "bg-[#f3f0da] text-[#514b28] dark:bg-[#302e22] dark:text-[#eeebce]",
} as const;

/**
 * The same families, lighter: feature cards, where the illustration carries
 * the color. Each also sets `--point-card`, so what sits on the card (the fade
 * under its description) can paint with the card's own color. Not `--card`:
 * that is the theme token `bg-card` reads, which the app's components on the
 * card (an issue card) need to keep.
 */
export const SOFT_TONES = {
  sage: "bg-(--point-card) [--point-card:#f1f4ee] dark:[--point-card:#1b201c]",
  mint: "bg-(--point-card) [--point-card:#edf5f1] dark:[--point-card:#18211e]",
  lavender: "bg-(--point-card) [--point-card:#f4f1f8] dark:[--point-card:#1f1b25]",
  peach: "bg-(--point-card) [--point-card:#f9f2ea] dark:[--point-card:#231e19]",
  sky: "bg-(--point-card) [--point-card:#eef2f8] dark:[--point-card:#181e26]",
  rose: "bg-(--point-card) [--point-card:#f9eff2] dark:[--point-card:#241c20]",
  butter: "bg-(--point-card) [--point-card:#f7f5e8] dark:[--point-card:#222018]",
} as const;

export type SoftTone = keyof typeof SOFT_TONES;
