/**
 * Questions from both FAQs, in order of display.
 *
 * Extracted from their pages because they are now used twice: to
 * return the accordion, and to build the `FAQPage` node of `structured-data.tsx`
 * (MIN-88). Two lists would have drifted at the first addition of a question, and a
 * `FAQPage` which announces a question absent from the page is an error reported
 * by the Rich Results Test.
 *
 * The i18n keys follow the convention `faq_<key>_q` / `faq_<key>_a`, in the
 * namespace `Landing` for the former and `Pricing` for the latter.
 */

/** Questions asked before registration (MIN-73): what the agent sees, where
 the data lives, how usage billing works. */
export const FAQ_KEYS = [
  "agents",
  "byok",
  "usage",
  "data",
  "team",
  "migrate",
] as const;

/**
 * `byok` FIRST (MIN-149). It closed the list, in place of a reserve
 * which is granted once the price is accepted. It's the opposite: for those who code with
 * agents all day and already pay for their tokens, "the agent can turn
 * on your key" is what makes the rest of the page readable — the subscription
 * buys minddy, the included usage is the convenience of who doesn't want to bother.
 * The section “Your key, your inference” says it earlier on the page; the
 * question remains here because it carries both caveats (the key is only worth
 * to the agent, and it does not lift the plan guard).
 *
 * Money matters follow, then `mcp` — the last objection that the
 * table left open: connecting ITS agents is not guarded by any plan.
 */
export const PRICING_FAQ_KEYS = [
  "byok",
  "usage",
  "overage",
  "change",
  "refund",
  "mcp",
] as const;

/**
 * The three objections of `/mcp` (MIN-93), namespace `Mcp`: is it paid,
 * which agents, and where do we find the API key — the last being a question
 * trap, since there is none steps.
 *
 * Three and not six: the page targets a specific request and the reader arrives there
 * with a specific question. A FAQ that answers next to it is not cited.
 */
export const MCP_FAQ_KEYS = ["free", "agents", "key"] as const;
