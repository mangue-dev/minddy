import type messages from "./messages/en.json";
import type { locales } from "./i18n/config";

/**
 * Typage strict de next-intl : le catalogue anglais (la locale de référence,
 * cf. `defaultLocale`) devient le TYPE des messages.
 *
 * Ce que ça achète, et pourquoi ça vaut le coût : sans cette augmentation,
 * `AppConfig` est vide, `Messages` retombe sur `Record<string, any>`, et la
 * signature `TranslateArgs` de use-intl prend sa branche `string extends Value`
 * — où `values` est OPTIONNEL. Autrement dit `t("deleteViewTitle")` compilait
 * alors même que le message est `"Delete “{name}”?"`, et le dialog affichait
 * `Board.deleteViewTitle` à l'écran (next-intl retombe sur le chemin de la clé
 * quand le formatage échoue). Un bug muet : pas d'exception, pas de log, une
 * chaîne qui ressemble à une chaîne.
 *
 * Avec le catalogue en type, `ICUArgs` extrait `{name: string}` du message, et
 * `values` devient OBLIGATOIRE. La faute est désormais une erreur de compilation
 * — donc rattrapée par `pnpm typecheck` en local ET servie automatiquement au
 * code agent en fin de tour (MIN-110, lib/server/agent/diagnostics.ts).
 *
 * Le prix, mesuré sur ce dépôt (`tsc --noEmit`, cache `.tsbuildinfo` purgé) :
 * 8,2 s sans, 10,3 s avec. +25 % à froid, indiscernable à chaud — le coût
 * d'instancier 2 600 clés en types littéraux.
 *
 * Ce que ça NE fait PAS, et c'est important : les ARGUMENTS ne sont pas
 * vérifiés. Les messages viennent d'un import JSON, dont TypeScript élargit
 * toute valeur de chaîne en `string` ; `TranslateArgs` prend alors sa branche
 * `string extends Value`, où `values` est optionnel. Aucune configuration ne
 * change ça. C'est `lib/i18n-contract.test.ts` qui tient ce contrat-là.
 *
 * Conséquence à connaître : une clé construite à l'exécution (`t(\`errors.${code}\`)`)
 * n'est plus typable telle quelle. La convention du dépôt est de la caster
 * explicitement en `Parameters<typeof t>[0]` — c'est volontairement visible dans
 * le code, parce que c'est précisément l'endroit où le compilateur ne garantit
 * plus rien.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: typeof messages;
  }
}
