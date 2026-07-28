import type { Messages, NamespaceKeys, NestedKeyOf, useTranslations } from "next-intl";

/**
 * Outillage de types pour les clés i18n construites AILLEURS que sur place :
 * tables de correspondance (`{ quotaExceeded: "errorQuotaExceeded" }`),
 * catalogues de raccourcis, listes de sections. Le typage strict de next-intl
 * (cf. `global.d.ts`) vérifie `t("cle")` écrit en dur ; ces types étendent la
 * même vérification aux clés qui transitent par une constante.
 *
 * Le gain n'est pas cosmétique : une table déclarée `Record<string, string>`
 * accepte une clé qui n'existe pas, et l'écran affiche alors le chemin de la
 * clé (`Agent.errorTypo`) au lieu du message. Déclarée `MessageKey<"Agent">`,
 * la même faute ne compile pas.
 *
 * Reste le cas irréductible : une clé assemblée à l'exécution à partir d'une
 * valeur serveur (`t(\`errors.${code}\`)`). Aucun type ne peut la garantir — on
 * la caste explicitement au point d'appel avec `Parameters<typeof t>[0]`, ce
 * qui rend visible l'endroit exact où le compilateur cesse de répondre.
 */

/** Les namespaces du catalogue (`"Board"`, `"Common"`, `"Agent"`…). */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/** Les clés que `t()` accepte pour le namespace `N`. */
export type MessageKey<N extends Namespace> = Parameters<
  ReturnType<typeof useTranslations<N>>
>[0];
