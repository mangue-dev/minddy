/**
 * Les questions des deux FAQ, dans l'ordre d'affichage.
 *
 * Extraites de leurs pages parce qu'elles servent maintenant deux fois : à
 * rendre l'accordéon, et à construire le nœud `FAQPage` de `structured-data.tsx`
 * (MIN-88). Deux listes auraient dérivé au premier ajout de question, et un
 * `FAQPage` qui annonce une question absente de la page est une erreur signalée
 * par le Rich Results Test.
 *
 * Les clés i18n suivent la convention `faq_<clé>_q` / `faq_<clé>_a`, dans le
 * namespace `Landing` pour les premières et `Pricing` pour les secondes.
 */

/** Questions posées avant l'inscription (MIN-73) : ce que voit l'agent, où
    vivent les données, comment marche la facturation à l'usage. */
export const FAQ_KEYS = [
  "agents",
  "byok",
  "usage",
  "data",
  "team",
  "migrate",
] as const;

/**
 * `byok` EN PREMIER (MIN-149). Il fermait la liste, à la place d'une réserve
 * qu'on concède une fois le prix accepté. C'est l'inverse : pour qui code avec
 * des agents toute la journée et paye déjà ses tokens, « l'agent peut tourner
 * sur votre clé » est ce qui rend le reste de la page lisible — l'abonnement
 * achète minddy, l'usage inclus est la commodité de qui ne veut pas s'embêter.
 * La section « Votre clé, votre inférence » le dit plus haut sur la page ; la
 * question reste ici parce qu'elle porte les deux réserves (la clé ne vaut que
 * pour l'agent, et elle ne lève pas la garde de plan).
 *
 * Suivent les questions d'argent, puis `mcp` — la dernière objection que le
 * tableau laisse ouverte : brancher SES agents n'est gardé par aucun plan.
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
 * Les trois objections de `/mcp` (MIN-93), namespace `Mcp` : est-ce payant,
 * quels agents, et où trouve-t-on la clé d'API — la dernière étant une question
 * piège, puisqu'il n'y en a pas.
 *
 * Trois et pas six : la page vise une requête précise et le lecteur y arrive
 * avec une question précise. Une FAQ qui répond à côté n'est pas citée.
 */
export const MCP_FAQ_KEYS = ["free", "agents", "key"] as const;
