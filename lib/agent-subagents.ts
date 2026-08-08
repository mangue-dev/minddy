import type { AgentRunEvent } from "./agent-api";

/** Un sous-agent (MIN-112) du tour en cours, tel que le fil d'events le montre. */
export interface TurnSubagent {
  /** Id lisible que le parent manipule (`sub-1`). */
  id: string;
  mode: "explore" | "implement" | null;
  /** `created_at` de son premier event : le début de son chrono. */
  startedAt: string;
  /** `created_at` de l'event qui l'a close, ou `null` tant qu'elle tourne. */
  endedAt: string | null;
}

/** Ce qui referme un tour, ou en ouvre un autre — hors events de sous-agent. */
function opensNewTurn(type: AgentRunEvent["type"]): boolean {
  return (
    type === "summary" ||
    type === "question" ||
    type === "quota_exhausted" ||
    type === "user_message"
  );
}

/**
 * Les sous-agents du TOUR EN COURS, de la plus ancienne à la plus récente, avec
 * celles qui ont déjà rendu leur rapport.
 *
 * Le tour, et pas la session : c'est l'unité à laquelle le fil raconte déjà tout
 * le reste (un accordéon de travail par tour). Les filles d'un tour passé n'ont
 * plus rien à dire — leur rapport est arrivé, le parent a répondu — et les lister
 * ferait grandir la carte à chaque délégation de la conversation.
 *
 * Une fille est FINIE dès qu'elle a rendu son résumé, échoué, ou que le parent a
 * annoncé la livraison de son rapport (`status` / `phase: subagent_report`) — ce
 * dernier cas est le seul signal d'une fille COUPÉE, qui n'émet ni l'un ni
 * l'autre. Mêmes règles que l'agrégation du fil (`buildFeed`), qui en tire les
 * blocs repliés.
 *
 * Pourquoi c'est à part : pendant qu'une fille travaille, le PARENT est bloqué et
 * n'émet rien. Le fil ne bouge donc plus du tout, et la seule chose qui dit que
 * la session est vivante est enterrée dans une ligne repliée, quelque part plus
 * haut. La carte au-dessus du composer la remonte sous les yeux.
 */
export function turnSubagents(events: AgentRunEvent[]): TurnSubagent[] {
  const collected = new Map<string, TurnSubagent>();

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const p = e.payload ?? {};
    const id = typeof p.subagent_id === "string" ? p.subagent_id : "";

    if (id) {
      let block = collected.get(id);
      if (!block) {
        block = {
          id,
          mode:
            p.subagent_mode === "implement"
              ? "implement"
              : p.subagent_mode === "explore"
                ? "explore"
                : null,
          startedAt: e.created_at,
          endedAt: null,
        };
        collected.set(id, block);
      }
      if (e.type === "summary" || e.type === "error") block.endedAt ??= e.created_at;
      continue;
    }

    // Le parent annonce qu'un rapport lui a été remis : c'est le seul instant de
    // fin d'une fille coupée, qui n'émet ni résumé ni erreur.
    if (e.type === "status" && p.phase === "subagent_report" && typeof p.id === "string") {
      const block = collected.get(p.id);
      if (block) block.endedAt ??= e.created_at;
      continue;
    }

    // Le tour se referme (réponse finale, question, budget épuisé) ou un message
    // de l'utilisateur en ouvre un autre : ce qui précède appartient au tour d'avant.
    if (opensNewTurn(e.type)) collected.clear();
  }

  return [...collected.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
