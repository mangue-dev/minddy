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
 * Les quatre premières portent sur l'argent ; `mcp` et `byok` ferment les deux
 * objections que le tableau laisse ouvertes — brancher SES agents par MCP n'est
 * gardé par aucun plan (seul l'agent Numo l'est), et une clé perso lève le
 * plafond d'usage sans lever la porte de plan.
 */
export const PRICING_FAQ_KEYS = [
  "usage",
  "overage",
  "change",
  "refund",
  "mcp",
  "byok",
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
