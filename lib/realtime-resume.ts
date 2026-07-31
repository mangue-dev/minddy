/**
 * Reprise après une absence : ce qu'il faut faire quand l'onglet revient au
 * premier plan (changement d'onglet, machine sortie de veille).
 *
 * Le problème est que PERSONNE ne le fait à notre place :
 *
 * - `refetchOnWindowFocus` est à false (lib/query-provider.tsx) — la fraîcheur
 *   est censée venir du pont temps réel, pas de l'horloge ;
 * - `refetchOnReconnect` n'écoute que l'événement `online` du navigateur, qu'une
 *   veille ou un onglet gelé n'émettent jamais ;
 * - restait la socket… c'est-à-dire précisément ce qui vient de mourir.
 *
 * Et elle met du temps à s'en apercevoir. Un onglet caché voit ses minuteurs
 * gelés (Chrome les passe à un par minute après cinq minutes, puis gèle
 * carrément l'onglet) : le heartbeat de 25 s ne part plus, et phoenix ne conclut
 * à la mort qu'après un aller-retour complet — 25 s pour envoyer le battement
 * suivant, 25 s de plus pour le déclarer perdu — avant de rejoindre avec un
 * backoff de 1 → 2 → 5 → 10 s. D'où la dizaine de secondes d'état périmé à
 * l'écran au retour, pendant lesquelles l'utilisateur lit des données fausses
 * sans qu'aucun indicateur ne le lui dise.
 *
 * La réponse tient en une phrase : **au retour, on ne demande rien à la
 * socket.** On refetch tout de suite (c'est ce que l'utilisateur voit), et on
 * réveille la socket en parallèle. Ce qu'elle rapportera ensuite est un bonus.
 *
 * Séparé du provider pour être testable : vitest tourne sur node nu, sans React
 * ni navigateur (même raison que lib/realtime-topics.ts).
 */

/**
 * En dessous de cette absence, une socket qui se dit connectée l'est vraiment :
 * on ne refetch pas. Au-dessus, elle a pu mourir en silence pendant le gel des
 * minuteurs — le doute suffit à justifier une poignée de GET.
 */
export const RESUME_AFTER_HIDDEN_MS = 15_000;

/** Délai avant de conclure qu'un heartbeat sans réponse ne viendra jamais. */
export const ZOMBIE_PROBE_MS = 3_000;

/**
 * Faut-il rattraper les caches au retour ?
 *
 * Une socket tombée est un oui sans condition, quelle qu'ait été la durée : ce
 * qui est tombé a forcément laissé passer des événements. Sinon on s'en remet à
 * la durée, parce qu'une socket peut se dire ouverte tout en étant morte (le
 * navigateur ne l'apprend qu'en écrivant dedans).
 */
export function shouldCatchUpOnResume({
  hiddenForMs,
  socketConnected,
}: {
  hiddenForMs: number;
  socketConnected: boolean;
}): boolean {
  if (!socketConnected) return true;
  return hiddenForMs >= RESUME_AFTER_HIDDEN_MS;
}

/** Ce qu'on utilise d'une socket realtime — assez pour la tester avec un faux. */
export interface WakeableRealtime {
  isConnected(): boolean;
  connect(): void;
  setAuth(token?: string | null): Promise<void>;
  sendHeartbeat(): Promise<void>;
  readonly pendingHeartbeatRef: string | null;
}

/**
 * Réveille la socket sans attendre qu'elle s'aperçoive de sa propre mort.
 *
 * Trois gestes, tous en API publique :
 *
 * 1. `setAuth()` — le JWT a pu expirer pendant la veille, et une jonction de
 *    canal privé présentée avec un jeton périmé est refusée, ce qui relance le
 *    backoff pour rien.
 * 2. socket fermée → `connect()`, qui ne fait rien si une reconnexion est déjà
 *    en vol.
 * 3. socket « ouverte » mais peut-être zombie → on lui écrit dessus. Un premier
 *    battement part ; s'il n'a toujours pas de réponse {@link ZOMBIE_PROBE_MS}
 *    plus tard, le second déclenche la logique de timeout de phoenix, qui
 *    démonte et replanifie une reconnexion immédiate. Détection en ~3 s au lieu
 *    de 50.
 *
 * Renvoie le minuteur de la sonde, à annuler au démontage (null s'il n'y en a
 * pas eu besoin).
 */
export function wakeRealtime(
  realtime: WakeableRealtime
): ReturnType<typeof setTimeout> | null {
  // Volontairement non attendu : le rattrapage des caches ne dépend pas de lui.
  void realtime.setAuth().catch(() => {});

  if (!realtime.isConnected()) {
    realtime.connect();
    return null;
  }

  void realtime.sendHeartbeat();
  return setTimeout(() => {
    // Toujours en attente : la socket ne répond plus, on force la conclusion.
    if (realtime.pendingHeartbeatRef) void realtime.sendHeartbeat();
  }, ZOMBIE_PROBE_MS);
}
