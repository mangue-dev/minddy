/**
 * `server-only` n'existe qu'à travers le bundler de Next : un module qui
 * l'importe est illisible sous vitest (« Cannot find package 'server-only' »).
 * L'aliaser sur ce fichier vide rend testables les modules serveur qui sont
 * PURS malgré le garde-fou — `lib/server/agent/tools.ts`, dont `agentToolsFor`
 * décide du jeu de tools servi au modèle (MIN-115).
 *
 * Ça ne change rien au build : l'alias ne vit que dans vitest.config.ts, et le
 * vrai garde-fou reste en place côté Next.
 */
export {};
