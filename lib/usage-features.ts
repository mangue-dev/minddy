import { BILLABLE_FEATURES, type BillableFeature } from "@/lib/billing-plans";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The NAME that the user reads on a line in their usage history.
 *
 * The budget bar speaks in SEGMENTS (`USAGE_SEGMENTS`) — six families, six
 * colors — because a bar with eighteen shares is no longer read. The history,
 * shows gestures: one line = one run, and “Automations” does not say
 * what happened. Smart Assign and Smart-fill share a segment;
 * when the line confuses them, the question we ask ourselves in front of the history
 * ("what did I trigger?") has no answer. Hence this table:
 * the segment keeps the icon and the color - the family is visible - and the label
 * says the exact feature.
 *
 * `import_map` and `brief_split` are part of it even though they are ABSENT de
 * `BILLABLE_FEATURES`: they are charged to a user (`billTo: userId`)
 * so they appear in his history, and without them here, the line
 * inherited the fallback of `segmentForFeature` and was displayed "Numo". They
 * remain outside the bar - it is `BILLABLE_FEATURES` who fills it.
 *
 * `landing_demo` is not there: it is invoiced to the platform, no account
 * has a line for this name.
 */
const USER_BILLED_INTERNAL_FEATURES = ["import_map", "brief_split"] as const;

export const USAGE_HISTORY_FEATURES = [
  ...BILLABLE_FEATURES,
  ...USER_BILLED_INTERNAL_FEATURES,
] as const;

export type UsageHistoryFeature =
  | BillableFeature
  | (typeof USER_BILLED_INTERNAL_FEATURES)[number];

/**
 * Label of each feature, USER side — the vocabulary of the product, not
 * that of the ledger. The finance admin has his own table (`Admin.finance.features`),
 * deliberately technical: there we read a margin, here we remember a
 * gesture. `MessageKey` rather than `string`: a faulty key does not compile.
 */
export const FEATURE_LABEL_KEYS: Record<UsageHistoryFeature, MessageKey<"Billing">> = {
  numo_chat: "historyFeatureNumoChat",
  numo_comment: "historyFeatureNumoComment",
  dictation: "historyFeatureDictation",
  transcription: "historyFeatureTranscription",
  smart_assign: "historyFeatureSmartAssign",
  smart_fill: "historyFeatureSmartFill",
  feedback_classify: "historyFeatureFeedbackClassify",
  feedback_analyze: "historyFeatureFeedbackAnalyze",
  feedback_voice: "historyFeatureFeedbackVoice",
  embedding: "historyFeatureEmbedding",
  agent_code: "historyFeatureAgentCode",
  sandbox_compute: "historyFeatureSandboxCompute",
  web_search: "historyFeatureWebSearch",
  pr_review: "historyFeaturePrReview",
  routine_code: "historyFeatureRoutineCode",
  routine_compute: "historyFeatureRoutineCompute",
  import_map: "historyFeatureImportMap",
  brief_split: "historyFeatureBriefSplit",
};

/**
 * The feature of a ledger line, if the user has a word for it.
 *
 * Returns `null` on everything that we cannot name (feature removed from the code but
 * still in base, `landing_demo` arrived there by accident): the caller then falls back to the segment name, which remains true. Never assemble an i18n key to
 * from a base value without going through here — it is the path of the key
 * that would be displayed on the screen.
 */
export function toUsageHistoryFeature(feature: string): UsageHistoryFeature | null {
  return (USAGE_HISTORY_FEATURES as readonly string[]).includes(feature)
    ? (feature as UsageHistoryFeature)
    : null;
}
