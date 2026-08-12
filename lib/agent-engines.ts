/**
 * QUEL HARNESS A JOUÉ UN RUN (MIN-286).
 *
 * `opencode` — le serveur headless piloté par notre superviseur
 * ([vm/supervisor.ts](server/agent/vm/supervisor.ts)) — est LE moteur : tout run
 * créé part avec lui, sans drapeau ni liste de projets. minddy a un utilisateur, et
 * un interrupteur qu'une seule personne pourrait actionner ne vaut pas la surface
 * qu'il ajoute.
 *
 * `loop` reste dans le type, et ce n'est pas de la nostalgie : les runs déjà en vol
 * au moment de la bascule portent cette valeur sur leur ligne, et ils doivent finir
 * sur la boucle qui a écrit leur checkpoint (les deux moteurs gardent leur mémoire
 * dans deux champs différents — `messages` d'un côté, `opencode` de l'autre). La
 * valeur disparaîtra avec `agent-loop.ts`, une fois qu'il ne restera plus rien à
 * reprendre.
 *
 * Le type vit ICI, hors de `server/`, pour la même raison qu'`agent-providers.ts` :
 * il traverse la frontière de la microVM ([vm/protocol.ts](server/agent/vm/protocol.ts)),
 * et ce fichier-là ne doit importer aucun module `server-only`.
 */

export const AGENT_ENGINES = ["loop", "opencode"] as const;

export type AgentEngine = (typeof AGENT_ENGINES)[number];

/** Le moteur de tout run neuf. */
export const AGENT_ENGINE: AgentEngine = "opencode";
