import { issueIdentifier } from "@/lib/issue-constants";
import type { AgentSessionListItem } from "@/lib/agent-api";

/**
 * Le NOM d'une conversation de l'agent, tel qu'il se lit dans la colonne comme
 * dans l'en-tête du volet — une seule fonction pour les deux, sinon les deux
 * divergent.
 *
 * Un run = une conversation, et un ticket en porte souvent plusieurs : sans son
 * IDENTIFIANT devant, trois conversations du même ticket se ressemblent trop
 * pour qu'on les distingue d'un coup d'œil, et deux tickets différents peuvent
 * se répondre mot pour mot (« Corriger la redirection »). L'identifiant, lui,
 * est unique et se cherche — c'est ce qu'on tape dans le filtre.
 *
 * La cascade du titre, du plus précis au plus vague :
 *  1. le titre écrit au lancement par le titreur (celui de la PR pour une
 *     relecture, MIN-168) ;
 *  2. le titre du TICKET, quand la génération n'a rien donné ou date d'avant
 *     `agent_runs.title` — mieux vaut le titre du ticket que rien ;
 *  3. le repli de l'appelant (« Conversation sans titre »), pour une
 *     conversation carnet sans titre ni note.
 */
export function agentSessionTitle(
  session: Pick<AgentSessionListItem, "title" | "issue" | "project">,
  fallback: string,
): string {
  const title = session.title?.trim() || session.issue?.title?.trim() || fallback;
  return session.issue && session.project
    ? `${issueIdentifier(session.project.key, session.issue.number)}: ${title}`
    : title;
}
