import { BILLABLE_FEATURES, type BillableFeature } from "@/lib/billing-plans";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Le NOM que l'utilisateur lit sur une ligne de son historique d'usage.
 *
 * La barre de budget parle en SEGMENTS (`USAGE_SEGMENTS`) — six familles, six
 * couleurs — parce qu'une barre à dix-huit parts ne se lit plus. L'historique,
 * lui, montre des gestes : une ligne = un run, et « Automatisations » n'y dit
 * pas ce qui s'est passé. Smart Assign et Smart-fill partagent un segment ;
 * quand la ligne les confond, la question qu'on se pose devant l'historique
 * (« qu'est-ce que j'ai déclenché ? ») n'a pas de réponse. D'où cette table :
 * le segment garde l'icône et la couleur — la famille se voit — et le libellé
 * dit la feature exacte.
 *
 * `import_map` et `brief_split` en font partie alors qu'elles sont ABSENTES de
 * `BILLABLE_FEATURES` : elles sont imputées à un utilisateur (`billTo: userId`)
 * donc elles apparaissent dans son historique, et sans elles ici, la ligne
 * héritait du repli de `segmentForFeature` et s'affichait « Numo ». Elles
 * restent hors de la barre — elle, c'est `BILLABLE_FEATURES` qui la remplit.
 *
 * `landing_demo` n'y est pas : elle se facture à la plateforme, aucun compte
 * n'a de ligne à ce nom.
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
 * Libellé de chaque feature, côté UTILISATEUR — le vocabulaire du produit, pas
 * celui du ledger. L'admin finance a sa propre table (`Admin.finance.features`),
 * volontairement technique : là-bas on lit une marge, ici on se souvient d'un
 * geste. `MessageKey` plutôt que `string` : une clé fautive ne compile pas.
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
 * La feature d'une ligne du ledger, si l'utilisateur a un mot pour elle.
 *
 * Rend `null` sur tout ce qu'on ne sait pas nommer (feature retirée du code mais
 * encore en base, `landing_demo` arrivée là par accident) : l'appelant retombe
 * alors sur le nom du segment, qui reste vrai. Jamais de clé i18n assemblée à
 * partir d'une valeur de base sans passer par ici — c'est le chemin de la clé
 * qui s'afficherait à l'écran.
 */
export function toUsageHistoryFeature(feature: string): UsageHistoryFeature | null {
  return (USAGE_HISTORY_FEATURES as readonly string[]).includes(feature)
    ? (feature as UsageHistoryFeature)
    : null;
}
