import { cap, toolArgSummary } from "../tool-summary";
import type { AgentEventType } from "@/lib/agent-api";

/**
 * LE FLUX D'OPENCODE, TRADUIT EN NOTRE FIL (MIN-286, lot 1).
 *
 * Un module PUR : il prend un événement du `/event` d'opencode et rend ce que le
 * superviseur doit émettre. Aucune IO, aucun état de réseau — donc testable sur
 * des **fixtures réellement capturées** ([fixtures/opencode-turn.ndjson](fixtures/opencode-turn.ndjson),
 * un tour complet avec appel de tool), ce que la traduction faite au fil de l'eau
 * dans un client HTTP n'aurait jamais permis.
 *
 * CE QUE LA TRADUCTION DOIT TENIR, et c'est le critère de bascule du lot 3 : **le
 * fil raconte la même chose**. Mêmes types d'events, mêmes payloads, même ordre.
 * Un `tool_call` dont le payload change de forme casse l'affichage du fil ET la
 * relecture d'un run passé, puisque `agent_run_events` ne garde rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ (serveur réel, tour complet capturé le 2026-08-12)
 *
 * - un appel de tool passe par **trois** `message.part.updated` : `pending`
 *   (l'input est encore vide), `running` (input complet, `time.start`), puis
 *   `completed` (output, `time.end`) ou `error`. C'est `running` qui vaut notre
 *   `tool_call` — sur `pending`, on ne saurait pas dire QUOI est appelé ;
 * - le texte de la réponse arrive en `message.part.delta` (`field: "text"`,
 *   `delta`), puis le part complet en `message.part.updated` ;
 * - le coût du round arrive sur `message.updated` du message assistant, deux fois
 *   (le même nombre) : d'où la déduplication par `messageID` + `finish` ;
 * - `session.status` alterne `busy`/`idle`, et `session.idle` clôt le tour.
 *
 * LES NOMS SONT TRADUITS DANS LES DEUX SENS. Opencode appelle `read` ce que nous
 * appelons `read_file`, et lui passe `filePath` là où nous passons `path`. Le fil,
 * lui, sait afficher `read_file`/`path` — et la relecture d'un run d'il y a trois
 * mois aussi. Traduire ici est donc le seul endroit où ça ne coûte rien ; le faire
 * dans l'UI aurait obligé à y garder les deux vocabulaires pour toujours.
 */

/** Un événement du flux `/event`, tel qu'opencode le publie. */
export interface OpencodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

/** Ce que le superviseur doit émettre — un event de NOTRE fil. */
export interface TranslatedEvent {
  type: AgentEventType;
  payload: Record<string, unknown>;
}

/** Le coût et les tokens d'un round, relevés sur le message assistant. */
export interface RoundUsage {
  messageId: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `stop`, `tool_calls`, `length`… — tel qu'opencode le rend. */
  finish: string | null;
}

/** Ce qu'un événement traduit produit : des events, du direct, du compte. */
export interface Translation {
  events: TranslatedEvent[];
  /** Le texte du round tel qu'écrit jusqu'ici (COMPLET, pas un delta). */
  liveText?: string;
  /** Un round assistant s'est terminé : sa ligne de ledger est prête. */
  usage?: RoundUsage;
  /** Le tour est fini (`session.idle`). */
  idle?: boolean;
  /** Le tour est mort (`session.error`) — le message est celui d'opencode. */
  error?: string;
}

/**
 * LES NOMS DE TOOLS, D'OPENCODE VERS LES NÔTRES.
 *
 * `webfetch` n'y est pas : nous n'avons jamais eu ce tool, donc le fil n'a pas de
 * nom à lui opposer — il passe tel quel, et c'est un nom de plus au vocabulaire
 * plutôt qu'un nom traduit de travers. `question` non plus : il ne devient pas un
 * `tool_call` mais un event `question`, qui a sa propre forme.
 */
const TOOL_NAMES: Record<string, string> = {
  read: "read_file",
  write: "write_file",
  edit: "edit_file",
  bash: "run_command",
  task: "spawn_agent",
  // Ceux-là portent déjà notre nom : les écrire rend la table lisible d'un coup
  // d'œil, et surtout vérifiable — « les 14 intégrés sont-ils tous traités ? ».
  glob: "glob",
  grep: "grep",
  apply_patch: "apply_patch",
};

/**
 * LES ARGUMENTS, de même. La table est par tool et par champ, parce que c'est la
 * seule forme qui se relise : `filePath → path` sur `read`, `include → glob` sur
 * `grep`. Un champ absent de la table passe tel quel — nos tools de domaine, eux,
 * ont exactement nos noms, puisque c'est nous qui les avons générés.
 */
const TOOL_ARGS: Record<string, Record<string, string>> = {
  read: { filePath: "path" },
  write: { filePath: "path" },
  edit: { filePath: "path", oldString: "old_string", newString: "new_string", replaceAll: "replace_all" },
  bash: { command: "command", workdir: "workdir" },
  grep: { include: "glob" },
  task: { subagent_type: "mode", description: "task" },
};

/** Le nom de tool que le fil connaît. */
export function ourToolName(opencodeName: string): string {
  return TOOL_NAMES[opencodeName] ?? opencodeName;
}

/** Les arguments d'un tool, renommés pour que `toolArgSummary` les reconnaisse. */
export function ourToolArgs(
  opencodeName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const table = TOOL_ARGS[opencodeName];
  if (!table) return input;
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [table[k] ?? k, v]));
}

/** Longueur de l'aperçu persisté dans `tool_result` — la même que la boucle. */
const PREVIEW_MAX = 400;

function numberAt(source: unknown, ...path: string[]): number {
  let node: unknown = source;
  for (const key of path) {
    if (!node || typeof node !== "object") return 0;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "number" && Number.isFinite(node) ? node : 0;
}

/**
 * L'état d'un tour, entre deux événements. Le traducteur est pur, mais le flux ne
 * l'est pas : un `delta` ne porte que son fragment, et un `message.updated` répété
 * porte deux fois le même coût.
 */
export interface TurnStreamState {
  /** Texte accumulé du round en cours, par part. */
  textByPart: Map<string, string>;
  /** Rounds dont le coût a déjà été compté (`messageID`). */
  billed: Set<string>;
  /** Appels de tools amorcés dans le round en cours — le `tools` du direct. */
  toolsThisRound: number;
  /** `callID` déjà annoncés : `running` peut se répéter. */
  announced: Set<string>;
}

export function newTurnStreamState(): TurnStreamState {
  return {
    textByPart: new Map(),
    billed: new Set(),
    toolsThisRound: 0,
    announced: new Set(),
  };
}

/**
 * Traduit UN événement. Rend ce qu'il faut émettre, et mute l'état de flux.
 *
 * Ne lève jamais : le flux vient d'un tiers, et une forme inattendue doit être
 * ignorée, pas tuer un tour de deux heures. Ce qui n'est pas reconnu ne produit
 * rien — c'est ce que `events: []` veut dire.
 */
export function translateEvent(event: OpencodeEvent, state: TurnStreamState): Translation {
  const props = event.properties ?? {};

  switch (event.type) {
    case "message.part.delta": {
      if (props.field !== "text") return { events: [] };
      const partId = String(props.partID ?? "");
      const delta = typeof props.delta === "string" ? props.delta : "";
      if (!partId || !delta) return { events: [] };
      const text = (state.textByPart.get(partId) ?? "") + delta;
      state.textByPart.set(partId, text);
      return { events: [], liveText: text };
    }

    case "message.part.updated": {
      const part = (props.part ?? {}) as Record<string, unknown>;
      if (part.type === "text") {
        const partId = String(part.id ?? "");
        const text = typeof part.text === "string" ? part.text : "";
        if (partId && text) state.textByPart.set(partId, text);
        return { events: [], ...(text ? { liveText: text } : {}) };
      }
      if (part.type !== "tool") return { events: [] };

      const stateNode = (part.state ?? {}) as Record<string, unknown>;
      const status = String(stateNode.status ?? "");
      const callId = String(part.callID ?? part.id ?? "");
      const opencodeName = String(part.tool ?? "");
      const name = ourToolName(opencodeName);
      const input = ourToolArgs(
        opencodeName,
        (stateNode.input ?? {}) as Record<string, unknown>,
      );

      if (status === "running") {
        // `pending` ne dit pas encore QUOI est appelé (`input: {}` mesuré) : un
        // event émis là afficherait un appel sans argument, puis rien.
        if (!callId || state.announced.has(callId)) return { events: [] };
        state.announced.add(callId);
        state.toolsThisRound += 1;
        return {
          events: [
            { type: "tool_call", payload: { id: callId, name, ...toolArgSummary(name, input) } },
          ],
        };
      }

      if (status === "completed" || status === "error") {
        const success = status === "completed";
        const raw = success ? stateNode.output : (stateNode.error ?? stateNode.output);
        const preview = cap(typeof raw === "string" ? raw : JSON.stringify(raw ?? ""), PREVIEW_MAX);
        return {
          events: [{ type: "tool_result", payload: { id: callId, name, success, preview } }],
        };
      }
      return { events: [] };
    }

    case "message.updated": {
      const info = (props.info ?? {}) as Record<string, unknown>;
      if (info.role !== "assistant") return { events: [] };
      const finish = typeof info.finish === "string" ? info.finish : null;
      // Un round non terminé arrive avec `cost: 0` et pas de `finish` : le
      // compter écrirait une ligne de ledger vide, puis une deuxième au vrai
      // coût. Et `message.updated` se répète à l'identique une fois terminé —
      // d'où les deux gardes, qui ne font pas le même travail.
      if (!finish) return { events: [] };
      const messageId = String(info.id ?? "");
      if (!messageId || state.billed.has(messageId)) return { events: [] };
      state.billed.add(messageId);

      // Un round fini : le suivant repart avec ses propres compteurs de direct.
      state.toolsThisRound = 0;
      state.textByPart.clear();

      return {
        events: [],
        usage: {
          messageId,
          model: String(info.modelID ?? ""),
          costUsd: numberAt(info, "cost"),
          inputTokens: numberAt(info, "tokens", "input"),
          outputTokens: numberAt(info, "tokens", "output"),
          reasoningTokens: numberAt(info, "tokens", "reasoning"),
          cacheReadTokens: numberAt(info, "tokens", "cache", "read"),
          cacheWriteTokens: numberAt(info, "tokens", "cache", "write"),
          finish,
        },
      };
    }

    case "session.idle":
      return { events: [], idle: true };

    case "session.error": {
      const error = (props.error ?? {}) as Record<string, unknown>;
      const message =
        typeof error.message === "string"
          ? error.message
          : typeof props.message === "string"
            ? props.message
            : JSON.stringify(error).slice(0, 1000);
      return { events: [{ type: "error", payload: { message } }], error: message };
    }

    default:
      // `session.status`, `session.updated`, `session.diff`, `server.connected` :
      // du bruit pour nous. Le fil n'a pas d'équivalent, et en inventer un
      // remplirait `agent_run_events` de lignes que personne ne lit.
      return { events: [] };
  }
}

/** Le texte du round en cours, tous parts confondus — la charge du direct. */
export function liveTextOf(state: TurnStreamState): string {
  return [...state.textByPart.values()].join("");
}
