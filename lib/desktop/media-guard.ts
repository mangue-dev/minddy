/**
 * Le micro, et rien d'autre (MIN-294).
 *
 * La coquille refuse par défaut tout ce que la page demande au système
 * (`ALLOWED_PERMISSIONS`, desktop/src/main.ts). La dictée vocale — le bouton
 * micro de Numo, du dialog « nouveau ticket », du carnet — passe par
 * `getUserMedia`, donc par la permission `media` : tant qu'elle n'était pas dans
 * la liste, Electron répondait non AVANT que macOS soit consulté. D'où le
 * symptôme, qui n'en avait pas l'air : « micro refusé, et aucune fenêtre de
 * demande ne s'est ouverte ». Il n'y avait personne à qui la demander.
 *
 * `media` couvre la caméra ET le micro, dans la même permission. On ne peut donc
 * pas se contenter de l'ouvrir : ce module dit ce qu'on accepte d'en laisser
 * passer — de l'audio, depuis notre origine, et c'est tout.
 *
 * Module PUR : la décision se prend et se teste ici ; `desktop/src/main.ts` ne
 * fait que la câbler sur `setPermissionRequestHandler`, puis demander à macOS.
 */

import { navigationDecision } from "./nav-guard";

/** Ce qu'Electron passe en `details` d'une demande `media`, réduit à ce qui décide. */
export interface MediaAccessRequest {
  /** L'origine du document qui demande — absente sur certaines demandes. */
  securityOrigin?: string;
  /** La dernière URL chargée par la frame demandeuse : le repli de l'origine. */
  requestingUrl?: string;
  /** `["audio"]` pour une dictée ; `["video"]` ou les deux pour une caméra. */
  mediaTypes?: readonly ("audio" | "video")[];
}

/**
 * Laisse-t-on cette demande atteindre le micro du Mac ?
 *
 * Trois conditions, et il les faut toutes :
 *
 * - **De l'audio, et rien que de l'audio.** Une demande qui porte `video`, même
 *   accompagnée d'`audio`, est refusée en bloc plutôt que rabotée : minddy n'a
 *   pas de caméra, et une demande qui en veut une ne vient pas de minddy.
 * - **Une liste explicite.** `mediaTypes` absent ou vide, c'est une demande dont
 *   on ne sait pas ce qu'elle ouvre — on ne signe pas à blanc.
 * - **Notre origine.** La fenêtre charge du code DISTANT ; la garde de
 *   navigation empêche d'y arriver, celle-ci empêche qu'un document qui y serait
 *   quand même arrivé (une frame, une page ouverte avant une mise à jour de la
 *   garde) allume le micro.
 */
export function microphoneRequestAllowed(
  request: MediaAccessRequest,
  origin: string
): boolean {
  const types = request.mediaTypes;
  if (!types || types.length === 0) return false;
  if (!types.every((type) => type === "audio")) return false;

  const from = request.securityOrigin || request.requestingUrl;
  if (!from) return false;
  return navigationDecision(from, origin) === "allow";
}
