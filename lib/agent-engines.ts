/**
 * QUEL HARNESS A JOUÉ UN RUN (MIN-286).
 *
 * `opencode` — le serveur headless piloté par notre superviseur
 * ([vm/supervisor.ts](server/agent/vm/supervisor.ts)) — est LE moteur, et depuis
 * la suppression de la boucle maison (2026-08-14) c'est le SEUL : plus de drapeau,
 * plus d'aiguillage, plus de second chemin à maintenir.
 *
 * `loop` reste dans le type, et ce n'est pas de la nostalgie : des centaines de
 * lignes d'`agent_runs` le portent, et la colonne se relit — un incident de juillet
 * se lit sur la ligne du run, pas sur ce qui tourne aujourd'hui. Ce que la valeur
 * ne fait PLUS, c'est décider : aucun code ne s'en sert pour choisir un chemin.
 *
 * Une conversation menée par la boucle n'est en revanche plus reprennable telle
 * quelle : les deux moteurs gardaient leur mémoire dans deux champs différents du
 * checkpoint (`messages` d'un côté, `opencode` de l'autre), et le premier n'a plus
 * de lecteur. La fonction le DIT au tour repris plutôt que de le taire — cf.
 * `priorConversationLost` dans [execute.ts](server/agent/execute.ts).
 *
 * Le type vit ICI, hors de `server/`, pour la même raison qu'`agent-providers.ts` :
 * il traverse la frontière de la microVM, et ce fichier-là ne doit importer aucun
 * module `server-only`.
 */

export const AGENT_ENGINES = ["loop", "opencode"] as const;

export type AgentEngine = (typeof AGENT_ENGINES)[number];

/**
 * Les moteurs qui peuvent encore JOUER un tour — à distinguer de `AGENT_ENGINES`,
 * qui énumère ce qu'une ligne de run peut porter. C'est sur celle-ci que se
 * comptent les garde-fous d'exécution (cf. `redaction-invariant.test.ts`) : un
 * moteur ajouté sans sa garde doit faire tomber la suite, un moteur RETIRÉ ne doit
 * pas réclamer une garde qui n'a plus de code à protéger.
 */
export const LIVE_AGENT_ENGINES = ["opencode"] as const satisfies readonly AgentEngine[];

export type LiveAgentEngine = (typeof LIVE_AGENT_ENGINES)[number];

/** Le moteur de tout run neuf. */
export const AGENT_ENGINE: AgentEngine = "opencode";
