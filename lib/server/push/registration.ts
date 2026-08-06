import "server-only";

/**
 * Ce qu'un (ré)enregistrement d'appareil décide de son `enabled` et de sa
 * `locale` (MIN-183).
 *
 * DEUX gestes très différents passent par la même route POST :
 *
 *   • une ACTIVATION — l'interrupteur des réglages, la permission qu'on vient
 *     d'accorder. Allumer EST son propos ;
 *   • un RAFRAÎCHISSEMENT — la remise d'aplomb au chargement de l'app
 *     (components/push-service-worker.tsx), et le ré-abonnement que le
 *     navigateur déclenche tout seul (`pushsubscriptionchange`). Personne n'a
 *     rien demandé : il ne doit RIEN changer de ce que l'utilisateur a réglé.
 *
 * Les confondre coûtait cher, et de façon invisible : `enabled: true` en dur
 * rallumait à chaque chargement de page l'appareil qu'on venait d'éteindre. Le
 * geste marchait sous les doigts, la ligne repassait à « actif » à la navigation
 * suivante — l'interrupteur par appareil, qui est le cœur du ticket, ne tenait
 * pas une seconde page.
 *
 * La langue suit la même règle : le service worker n'en a pas à donner (il ne
 * lit pas le cookie `NEXT_LOCALE`). En son absence, on garde celle de la ligne
 * précédente plutôt que de retomber sur l'anglais — un ré-abonnement spontané
 * n'a aucune raison de faire passer un téléphone français en anglais.
 */

/** L'état de l'appareil AVANT ce POST : sa ligne, ou celle qu'un ré-abonnement
 *  vient de périmer (`oldEndpoint`). `null` quand il n'y en a pas. */
export interface PriorRegistration {
  enabled: boolean;
  locale: string | null;
}

export function resolveRegistrationState(
  prior: PriorRegistration | null,
  input: { locale?: unknown; refresh?: unknown }
): { enabled: boolean; locale: string } {
  const locale =
    typeof input.locale === "string" && input.locale.trim()
      ? input.locale.trim()
      : prior?.locale?.trim() || "en";
  return {
    // Un rafraîchissement PRÉSERVE ; tout le reste allume. Sans ligne
    // antérieure, un rafraîchissement porte un abonnement que le serveur ne
    // connaissait pas : il naît actif, comme une activation.
    enabled: input.refresh === true ? (prior?.enabled ?? true) : true,
    locale,
  };
}
