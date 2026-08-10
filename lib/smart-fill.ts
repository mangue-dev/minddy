/**
 * SMART-FILL (MIN-260) — la préférence de compte, et rien d'autre.
 *
 * Le formulaire de création demande sept propriétés à chaque ticket, dont quatre
 * qui se déduisent de ce qu'on vient d'écrire : la priorité, l'effort, les
 * catégories et l'objectif. Smart-fill les pose à la création, à partir du seul
 * titre + description. Les trois qui restent — statut, assigné, échéance — ne se
 * déduisent de rien : elles disent une intention, et elles restent à la main.
 *
 * Stockée dans le `user_metadata` du compte Supabase, comme
 * [auto-assign-on-start](auto-assign-on-start.ts) et ses voisines. **Activée par
 * défaut** : seul un `false` explicite la coupe — un compte neuf n'a pas de
 * métadonnée du tout, et une absence doit se lire comme le défaut, pas comme un
 * refus.
 *
 * Ce module ne dépend de RIEN (ni React, ni Supabase) : la modal de création le
 * lit côté client, l'écran de réglages l'écrit, et le serveur s'en sert pour
 * relire ce que le client prétend. C'est la seule définition de « activé ».
 */

export const SMART_FILL_META_KEY = "smart_fill";

/** Le compte a-t-il Smart-fill armé ? Activé par défaut ; seul un `false`
 *  explicite le désactive. */
export function resolveSmartFill(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.[SMART_FILL_META_KEY] !== false;
}
